"use client";

/**
 * How-to-play tab — discoverability surface for viewers. Per spec §8.
 *
 * Three sections: quick start, more commands, want-to-influence.
 * Bottom links to the streamer's Twitch channel. For Phase B v1
 * Twitch-only — Discord-as-streamer-integration hasn't shipped, so the
 * platform-aware copy from spec §8.2 stays text-only here.
 */

import { Button } from "@empac/cascadeds";

interface LiveHowToPlayTabProps {
  streamerName: string;
  twitchUsername: string | null;
  isAuthenticated: boolean;
  onSignInClick: () => void;
}

export function LiveHowToPlayTab({
  streamerName,
  twitchUsername,
  isAuthenticated,
  onSignInClick,
}: LiveHowToPlayTabProps) {
  return (
    <div className="live-tab live-htp">
      <section className="live-htp__section">
        <h3>Quick start</h3>
        <ul>
          <li>
            Type <code>!gs-join</code> in {streamerName}&rsquo;s Twitch chat to
            enter the lobby
          </li>
          <li>
            Type <code>!gs-shuffle</code> to roll a random kart combo
          </li>
          <li>
            Type <code>!gs-mycombo</code> to recall the combo you rolled
          </li>
          <li>
            Type <code>!gs-lobby</code> to see who&rsquo;s in the shuffle
          </li>
        </ul>
      </section>

      <section className="live-htp__section">
        <h3>More commands</h3>
        <dl className="live-htp__commands">
          <dt><code>!gs-leave</code></dt>
          <dd>Drop out of the shuffle. 60s rejoin cooldown.</dd>
          <dt><code>!gs-help</code></dt>
          <dd>Get the command list inside chat. Context-aware to whatever&rsquo;s active.</dd>
          <dt><code>!gs-track [N]</code> · <code>!gs-race [N]</code></dt>
          <dd>
            Streamer-only. Roll a single race or a series of N races
            (e.g. <code>!gs-race 4</code> for a 4-race block with one item rule
            set across the series).
          </dd>
        </dl>
      </section>

      <section className="live-htp__section">
        <h3>Want to influence the race?</h3>
        {isAuthenticated ? (
          <p>
            You&rsquo;re signed in — head to the <strong>Tracks</strong> or{" "}
            <strong>Items</strong> tabs to pick or ban specific tracks and
            item rule sets.
          </p>
        ) : (
          <>
            <p>
              Sign in with Twitch to pick or ban specific tracks and item rule
              sets. We only ask for your Twitch identity (display name + avatar)
              — no chat, no channel-points, no DMs.
            </p>
            <Button variant="primary" onClick={onSignInClick}>
              Sign in with Twitch
            </Button>
          </>
        )}
      </section>

      {twitchUsername && (
        <section className="live-htp__section live-htp__section--attribution">
          <p>
            Catch the live stream:{" "}
            <a
              href={`https://www.twitch.tv/${twitchUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="live-page__twitch-link"
            >
              twitch.tv/{twitchUsername}
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
