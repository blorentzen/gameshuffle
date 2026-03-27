"use client";

import React from "react";

interface VideoHeroProps {
  videoSrc?: string;
  videoWebm?: string;
  videoPoster?: string;
  backgroundImage?: string;
  overlayOpacity?: number;
  height?: "full" | "large" | "medium" | "short";
  children: React.ReactNode;
}

export function VideoHero({
  videoSrc,
  videoWebm,
  videoPoster,
  backgroundImage,
  overlayOpacity = 0.5,
  height = "large",
  children,
}: VideoHeroProps) {
  const heightMap = {
    full: "100vh",
    large: "50vh",
    medium: "35vh",
    short: "10vh",
  };

  return (
    <header
      className="video-hero"
      data-height={height}
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: heightMap[height],
        display: "flex",
        alignItems: "center",
        color: "#fff",
        ...(backgroundImage && {
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }),
      }}
    >
      {videoSrc && (
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={videoPoster}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "120%",
            height: "120%",
            objectFit: "cover",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
          }}
        >
          {videoWebm && <source src={videoWebm} type="video/webm" />}
          <source src={videoSrc} type="video/mp4" />
        </video>
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
          zIndex: 2,
        }}
      />
      <div
        className="video-hero__content"
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          padding: height === "short" ? "1.5rem" : "3rem",
        }}
      >
        {children}
      </div>
    </header>
  );
}
