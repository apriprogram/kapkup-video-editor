/**
 * Alat baris perintah Kapkup, terutama untuk mengedit project lewat file.
 *
 *   npm run kapkup -- list
 *   npm run kapkup -- new "Nama project" [9:16|16:9|1:1|4:5]
 *   npm run kapkup -- validate <id>
 *   npm run kapkup -- add-media <id> <file> [file...]
 *   npm run kapkup -- still <id> <ms> [skala]
 *   npm run kapkup -- export <id> [nama=nilai ...] [--format mp4|gif|mp3] [--out nama-file]
 *   npm run kapkup -- transcribe <id> <idKlip> [tiny|base|small|medium] [kode bahasa]
 *   npm run kapkup -- tts <id> "teks" [nomor suara 0-9] [kecepatan] [id|en]
 */
import fsp from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { nanoid } from "nanoid";
import { ASPECT_PRESETS, captionsItemSchema, checkProject, contentDurationMs } from "../src/lib/project/schema";
import { isSupportedMedia, registerMedia, uniqueMediaName } from "../src/lib/server/media";
import { transcribeClip } from "../src/lib/server/transcribe";
import type { TtsLanguage } from "../src/lib/server/tts-config";
import { DEFAULT_WHISPER_MODEL } from "../src/lib/server/whisper-config";
import { WORKSPACE, createProject, listProjects, projectDir, readProject, writeProject } from "../src/lib/server/workspace";

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<number> {
  switch (command) {
    case "list": {
      const projects = await listProjects();
      console.log(`Workspace: ${WORKSPACE}`);
      for (const project of projects) {
        console.log(`${project.id}\t${project.name}\t${project.width}x${project.height}`);
      }
      if (projects.length === 0) console.log("(belum ada project)");
      return 0;
    }

    case "new": {
      const [name, ratio = "9:16"] = args;
      const preset = ASPECT_PRESETS.find((p) => p.id === ratio);
      if (!name || !preset) return usage();
      const id = await createProject(name, { width: preset.width, height: preset.height });
      console.log(id);
      return 0;
    }

    case "validate": {
      const [id] = args;
      if (!id) return usage();
      const { project } = await readProject(id);
      const issues = checkProject(project);
      const items = project.tracks.reduce((sum, track) => sum + track.items.length, 0);
      console.log(
        `${project.name}: ${project.settings.width}x${project.settings.height} @ ${project.settings.fps} fps, ` +
          `${project.assets.length} aset, ${project.tracks.length} track, ${items} klip, ${contentDurationMs(project)} ms`,
      );
      if (issues.length === 0) {
        console.log("OK");
        return 0;
      }
      for (const issue of issues) console.log(`MASALAH: ${issue}`);
      return 1;
    }

    case "add-media": {
      const [id, ...files] = args;
      if (!id || files.length === 0) return usage();
      const { project } = await readProject(id);
      const mediaDir = path.join(projectDir(id), "media");
      await fsp.mkdir(mediaDir, { recursive: true });
      for (const file of files) {
        if (!isSupportedMedia(file)) {
          console.error(`Dilewati (jenis tidak didukung): ${file}`);
          continue;
        }
        const source = path.resolve(file);
        let fileName: string;
        if (path.dirname(source) === mediaDir) {
          fileName = path.basename(source);
        } else {
          fileName = uniqueMediaName(id, path.basename(source));
          await fsp.copyFile(source, path.join(mediaDir, fileName));
        }
        const asset = await registerMedia(id, fileName, path.basename(source));
        project.assets.push(asset);
        console.log(`${asset.id}\t${asset.type}\t${asset.durationMs} ms\t${asset.width}x${asset.height}\t${asset.path}`);
      }
      await writeProject(id, project);
      return 0;
    }

    // Dipakai editor: hasil dicetak sebagai satu baris JSON, project.json tidak disentuh.
    case "transcribe-json": {
      const [id, itemId, model = DEFAULT_WHISPER_MODEL, language] = args;
      if (!id || !itemId) return usage();
      const result = await transcribeClip(id, itemId, {
        model: model as typeof DEFAULT_WHISPER_MODEL,
        language: language ?? null,
        log: (message) => console.error(message),
      });
      console.log(JSON.stringify(result));
      return 0;
    }

    case "transcribe": {
      const [id, itemId, model = DEFAULT_WHISPER_MODEL, language] = args;
      if (!id || !itemId) return usage();
      const result = await transcribeClip(id, itemId, {
        model: model as typeof DEFAULT_WHISPER_MODEL,
        language: language ?? null,
        log: (message) => console.error(message),
      });
      if (result.words.length === 0) {
        console.log("Tidak ada ucapan yang terdeteksi");
        return 0;
      }
      // Dibaca ulang tepat sebelum menulis, supaya perubahan selama transkripsi tidak tertimpa.
      const { project } = await readProject(id);
      project.tracks.unshift({
        id: `t-${nanoid(6)}`,
        kind: "text",
        name: "Caption",
        muted: false,
        hidden: false,
        items: [
          captionsItemSchema.parse({
            id: `i-${nanoid(8)}`,
            type: "captions",
            words: result.words,
            ...result.placement,
            transform: { y: Math.round(project.settings.height * 0.28) },
          }),
        ],
      });
      await writeProject(id, project);
      console.log(`${result.words.length} kata: ${result.words.map((word) => word.text).join(" ").slice(0, 200)}`);
      return 0;
    }

    // Dipakai editor: teks dibaca dari stdin, aset baru dicetak sebagai satu baris JSON,
    // project.json tidak disentuh.
    case "tts-json": {
      const [id, voice = "0", speed = "1", language = "id"] = args;
      if (!id) return usage();
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
      // Paket natif dimuat hanya saat dibutuhkan, supaya perintah lain tetap ringan.
      const { speak } = await import("../src/lib/server/tts");
      const asset = await speak(id, Buffer.concat(chunks).toString("utf8"), {
        voice: Number(voice),
        speed: Number(speed),
        language: language as TtsLanguage,
        log: (message) => console.error(message),
      });
      console.log(JSON.stringify({ asset }));
      return 0;
    }

    case "tts": {
      const [id, text, voice = "0", speed = "1", language = "id"] = args;
      if (!id || !text) return usage();
      const { speak } = await import("../src/lib/server/tts");
      const asset = await speak(id, text, {
        voice: Number(voice),
        speed: Number(speed),
        language: language as TtsLanguage,
        log: (message) => console.error(message),
      });
      // Dibaca tepat sebelum menulis, supaya perubahan selama suara dibuat tidak tertimpa.
      const { project } = await readProject(id);
      project.assets.push(asset);
      await writeProject(id, project);
      console.log(`${asset.id}\t${asset.type}\t${asset.durationMs} ms\t${asset.path}`);
      return 0;
    }

    case "export": {
      // kapkup export <id> [nama=nilai ...] [--format mp4|gif|mp3] [--out nama-file]
      const [id, ...rest] = args;
      if (!id) return usage();
      const vars: Record<string, string> = {};
      let format = "mp4";
      let name = `${id}-${Date.now()}`;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--format") format = rest[++i] ?? format;
        else if (rest[i] === "--out") name = (rest[++i] ?? name).replace(/[^\w.-]/g, "-");
        else if (rest[i].includes("=")) vars[rest[i].slice(0, rest[i].indexOf("="))] = rest[i].slice(rest[i].indexOf("=") + 1);
      }
      const result = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(process.cwd(), "scripts", "render.ts"),
          "--project", id, "--out", `exports/${name.replace(/\.(mp4|gif|mp3)$/, "")}.${format}`,
          "--format", format, "--vars", JSON.stringify(vars),
        ],
        { stdio: "inherit" },
      );
      return result.status ?? 1;
    }

    case "still": {
      const [id, ms = "0", scale = "0.25"] = args;
      if (!id) return usage();
      const output = `cache/still-${ms}.png`;
      const result = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(process.cwd(), "scripts", "render.ts"),
          "--project", id, "--still", output, "--ms", ms, "--scale", scale,
        ],
        { stdio: "inherit" },
      );
      return result.status ?? 1;
    }

    default:
      return usage();
  }
}

function usage(): number {
  console.error(
    [
      "Pemakaian:",
      "  kapkup list",
      '  kapkup new "Nama project" [9:16|16:9|1:1|4:5]',
      "  kapkup validate <id>",
      "  kapkup add-media <id> <file> [file...]",
      "  kapkup still <id> <ms> [skala]",
      "  kapkup export <id> [nama=nilai ...] [--format mp4|gif|mp3] [--out nama-file]",
      "  kapkup transcribe <id> <idKlip> [tiny|base|small|medium] [kode bahasa]",
      '  kapkup tts <id> "teks" [nomor suara 0-9] [kecepatan] [id|en]',
    ].join("\n"),
  );
  return 2;
}

main().then(
  (code) => process.exit(code),
  (error: Error) => {
    console.error(error.message);
    process.exit(1);
  },
);
