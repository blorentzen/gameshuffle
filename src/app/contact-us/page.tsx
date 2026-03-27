"use client";

import { useEffect } from "react";
import { Container } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";

export default function ContactPage() {
  useEffect(() => {
    // JotForm resize handler
    const handleMessage = (e: MessageEvent) => {
      if (typeof e.data === "object") return;
      const args = e.data.split(":");
      const iframe = document.getElementById(
        "JotFormIFrame-240215106629146"
      ) as HTMLIFrameElement | null;
      if (!iframe) return;

      switch (args[0]) {
        case "scrollIntoView":
          iframe.scrollIntoView();
          break;
        case "setHeight":
          iframe.style.height = args[1] + "px";
          break;
        case "reloadPage":
          window.location.reload();
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <>
      <VideoHero
        backgroundImage="/images/bg/MK8DX_Background_Music.jpg"
        overlayOpacity={0.65}
        height="short"
      >
        <Container>
          <h1 className="contact-hero__title">
            Let us know how we&apos;re doing.
          </h1>
        </Container>
      </VideoHero>

      <main>
        <Container>
          <section style={{ margin: "3rem 0", maxWidth: 900, marginInline: "auto" }}>
            <iframe
              id="JotFormIFrame-240215106629146"
              title="GameShuffle Contact Form"
              allowTransparency
              allowFullScreen
              allow="geolocation; microphone; camera"
              src="https://form.jotform.com/240215106629146?isIframeEmbed=1"
              frameBorder={0}
              style={{
                minWidth: "100%",
                maxWidth: "100%",
                height: 539,
                border: "none",
              }}
              scrolling="no"
            />
          </section>
        </Container>
      </main>
    </>
  );
}
