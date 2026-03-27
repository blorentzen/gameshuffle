import Image from "next/image";
import { Container } from "@empac/cascadeds";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Container>
        <div className="site-footer__top">
          <div className="site-footer__links">
            <a href="/terms">Terms of Service</a>
            <a href="/privacy">Privacy Policy</a>
            <a href="/contact-us">Contact Us</a>
          </div>
        </div>
        <div className="site-footer__bottom">
          <p className="site-footer__copy">&copy; {new Date().getFullYear()} GameShuffle</p>
          <a href="https://empac.co/" target="_blank" rel="noopener noreferrer" className="site-footer__empac">
            <Image src="/images/empacjs/empac/white/empac-emblem.svg" alt="Empac" width={18} height={18} />
            Apps by Empac
          </a>
        </div>
      </Container>
    </footer>
  );
}
