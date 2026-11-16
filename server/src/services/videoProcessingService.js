import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import fs from "fs/promises";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath);

const extractFrames = async (videoUrl, inspectionId, interval = 1) => {
  const outputDirectory = path.resolve("uploads", "frames", inspectionId.toString());
  await fs.mkdir(outputDirectory, { recursive: true });

  return new Promise((resolve, reject) => {
    ffmpeg(videoUrl)
      .outputOptions([
        "-vf",
        `fps=1/${interval},scale='min(1280,iw)':-2`,
        "-q:v",
        "2",
      ])
      .output(path.join(outputDirectory, "frame-%05d.jpg"))
      .on("end", async () => {
        try {
          const files = await fs.readdir(outputDirectory);
          resolve(
            files
              .filter((f) => f.endsWith(".jpg"))
              .sort()
              .map((f) => path.join(outputDirectory, f))
          );
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject)
      .run();
  });
};

export { extractFrames };