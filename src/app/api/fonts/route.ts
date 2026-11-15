import { listSystemFonts } from "@/lib/server/fonts";
import { fail } from "@/lib/server/http";

/** Nama font yang terpasang di komputer yang menjalankan Kapkup. */
export async function GET() {
  try {
    return Response.json({ fonts: await listSystemFonts() });
  } catch (error) {
    return fail(error);
  }
}
