"use client";
import { useRef, useState } from "react";
import { Film } from "lucide-react";
import { videoSizeLimitBytes } from "@/lib/video-limits";
import { requestJson } from "@/lib/workspace-client";

function mediaEvent(video: HTMLVideoElement, name: string) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
        cleanup();
        resolve();
      },
      fail = () => {
        cleanup();
        reject(new Error("This browser could not decode the video."));
      };
    const timer = setTimeout(fail, 15000);
    function cleanup() {
      clearTimeout(timer);
      video.removeEventListener(name, done);
      video.removeEventListener("error", fail);
    }
    video.addEventListener(name, done, { once: true });
    video.addEventListener("error", fail, { once: true });
  });
}
async function sample(file: File, limitMb: number | null) {
  if (file.size > videoSizeLimitBytes(limitMb))
    throw new Error(`This workspace accepts attachments up to ${limitMb} MB.`);
  if (["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)) {
    const image = new Image();
    const url = URL.createObjectURL(file);
    try {
      image.src = url;
      await image.decode();
      const ratio = Math.min(1,640 / Math.max(image.naturalWidth,image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1,Math.round(image.naturalWidth*ratio));
      canvas.height = Math.max(1,Math.round(image.naturalHeight*ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not preview this image.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return {name:file.name.slice(0,160),mime:file.type,duration:0,times:[0],frames:[canvas.toDataURL("image/jpeg",0.76)]};
    } finally { URL.revokeObjectURL(url); }
  }
  if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type))
    throw new Error("Choose an MP4, WebM, MOV, JPEG, PNG, WebP or GIF.");
  const video = document.createElement("video"),
    url = URL.createObjectURL(file);
  video.preload = "auto";
  video.muted = true;
  try {
    const loaded = mediaEvent(video, "loadeddata");
    video.src = url;
    await loaded;
    if (!Number.isFinite(video.duration)) {
      const end = mediaEvent(video, "seeked");
      video.currentTime = 86401;
      await end;
    }
    const duration = Number.isFinite(video.duration)
      ? video.duration
      : video.seekable.length
        ? video.seekable.end(video.seekable.length - 1)
        : video.currentTime;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("This clip has no readable duration.");
    const canvas = document.createElement("canvas"),
      ratio = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
    canvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not read video frames.");
    const frames: string[] = [],
      times: number[] = [],
      count = Math.min(8, Math.max(1, Math.ceil(duration / 2)));
    for (let i = 0; i < count; i++) {
      const time = (duration * (i + 0.5)) / count;
      const seeking = mediaEvent(video, "seeked");
      video.currentTime = time;
      await seeking;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.76));
      times.push(time);
    }
    return {
      duration,
      frames,
      times,
      mime: file.type,
      name: file.name.slice(0, 160),
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
export function VideoAttachment({
  url,
  caption,
  done,
  error,
  label = "Attach media",
  limitMb,
}: {
  url: string;
  caption: string;
  done: () => void;
  error: (s: string) => void;
  label?: string;
  limitMb: number | null;
}) {
  const input = useRef<HTMLInputElement>(null),
    [status, setStatus] = useState("");
  return (
    <>
      <button
        type="button"
        className="studio-inline"
        disabled={!!status}
        onClick={() => input.current?.click()}
      >
        <Film size={14} />
        {status || label}
      </button>
      <input
        hidden
        ref={input}
        type="file"
        multiple
        accept="video/mp4,video/webm,video/quicktime,image/jpeg,image/png,image/webp,image/gif"
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          error("");
          const failures: string[] = [];
          for (const [index,file] of files.entries()) {
          setStatus(`Reading ${index + 1} of ${files.length}…`);
          try {
            const metadata = new TextEncoder().encode(
              JSON.stringify({
                ...(await sample(file, limitMb)),
                caption: caption.slice(0, 4000),
                size: file.size,
              }),
            );
            // A four-byte, big-endian length separates the metadata from the file.
            const prefix = new ArrayBuffer(4);
            new DataView(prefix).setUint32(0, metadata.length);
            setStatus(`Uploading ${index + 1} of ${files.length}…`);
            await requestJson(url, {
              method: "POST",
              headers: { "Content-Type": "application/octet-stream" },
              body: new Blob([prefix, metadata, file]),
            });

          } catch (err) {
            failures.push(file.name + ": " + (err instanceof Error ? err.message : "Upload failed."));
          }
          }
          if (failures.length < files.length) done();
          if (failures.length) error(failures.join(" · "));
          setStatus("");
        }}
      />
    </>
  );
}
