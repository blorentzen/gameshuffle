"use client";

import { useState, useEffect } from "react";
import { Button } from "@empac/cascadeds";

const GA_ID = "G-WBXS3D8GBL";

function loadGA() {
  if (document.getElementById("ga-script")) return;
  const script = document.createElement("script");
  script.id = "ga-script";
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  script.async = true;
  document.head.appendChild(script);

  const initScript = document.createElement("script");
  initScript.id = "ga-init";
  initScript.textContent = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA_ID}');
  `;
  document.head.appendChild(initScript);
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookieConsent");
    if (consent === "accepted") {
      loadGA();
    } else if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookieConsent", "accepted");
    setVisible(false);
    loadGA();
  };

  const handleDecline = () => {
    localStorage.setItem("cookieConsent", "declined");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner">
      <p className="cookie-banner__text">
        We use cookies to analyze site usage and improve your experience.
      </p>
      <div className="cookie-banner__actions">
        <Button variant="primary" size="small" onClick={handleAccept}>Accept</Button>
        <Button variant="ghost" size="small" onClick={handleDecline}>Decline</Button>
      </div>
    </div>
  );
}
