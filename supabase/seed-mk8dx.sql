-- Seed MK8DX competitive config
INSERT INTO public.game_competitive_configs (game_slug, tier_list_url, tier_list_updated, standard_ruleset, community_links, notes)
VALUES (
  'mario-kart-8',
  'https://www.mk8dxstats.com/',
  '2026-03-01',
  '{"cc": "150cc", "items": false, "teamMode": false, "format": "time_trial"}',
  '[{"label": "MK8DX Stats", "url": "https://www.mk8dxstats.com/"}, {"label": "MKCentral", "url": "https://www.mariokartcentral.com/"}]',
  'Standard competitive MK8DX configuration. 150cc no-items is the primary format.'
)
ON CONFLICT (game_slug) DO UPDATE SET
  tier_list_url = EXCLUDED.tier_list_url,
  tier_list_updated = EXCLUDED.tier_list_updated,
  standard_ruleset = EXCLUDED.standard_ruleset,
  community_links = EXCLUDED.community_links,
  notes = EXCLUDED.notes;
