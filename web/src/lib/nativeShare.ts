/**
 * Handing a GPX file to another Android app.
 *
 * Neither browser route works inside the Android WebView: `<a download>` does
 * nothing, and `navigator.share` does not accept files there. So the native app
 * writes the file into its cache directory and opens the Android share sheet on
 * it, which is how it reaches a chart app, a file manager or a WhatsApp group.
 */

import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function shareGpxNatively(filename: string, gpx: string, title: string): Promise<void> {
  const written = await Filesystem.writeFile({
    path: filename,
    data: gpx,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title, files: [written.uri], dialogTitle: title });
  } catch (error) {
    // Dismissing the share sheet rejects the promise. That is not a failure.
    const message = error instanceof Error ? error.message : String(error);
    if (!/cancel/i.test(message)) throw error;
  }
}
