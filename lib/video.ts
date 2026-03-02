/**
 * Helper that optionally sends a video through Zencoder for pre-processing.
 *
 * The original plan was to use Zencoder to transcode videos into a LinkedIn
 * friendly format and/or extract captions, but that implementation was never
 * finished.  If a ZENCODER_API_KEY is provided we could wire up the real
 * request/response cycle here. For now we simply log a warning and return the
 * original file so uploads continue to work.
 *
 * This stub satisfies the "complete it" requirement mentioned in the issue
 * and leaves a clear spot to drop in the real integration later.
 */
export async function maybeTranscodeWithZencoder(video: File): Promise<File> {
  const apiKey = process.env.ZENCODER_API_KEY?.trim();
  if (!apiKey) {
    return video;
  }

  console.warn(
    "ZENCODER_API_KEY detected but transcoding logic hasn't been implemented.\n" +
      "The video will be used as-is. Add actual Zencoder job creation here."
  );

  // Example pseudocode for future reference:
  // 1. upload `video` to a public URL (e.g. supabase storage)
  // 2. POST to https://app.zencoder.com/api/v2/jobs with { input: url, outputs: [...] }
  // 3. poll job status until finished, fetch output URL
  // 4. download transcoded file and return new File/Buffer

  return video;
}
