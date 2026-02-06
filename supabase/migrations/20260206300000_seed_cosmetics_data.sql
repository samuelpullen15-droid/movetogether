-- ============================================================================
-- SEED DATA: COSMETICS STORE
-- ============================================================================
-- Run this after the cosmetics system migration
-- ============================================================================

-- ============================================================================
-- PROFILE FRAMES
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, asset_url, preview_url, sort_order) VALUES
-- Common Frames
('Simple Ring', 'A clean, minimal frame', 'profile_frame', 'common', 200, 50, 'frames/simple_ring.png', 'frames/simple_ring_preview.png', 1),
('Dotted Circle', 'Playful dotted border', 'profile_frame', 'common', 200, 50, 'frames/dotted_circle.png', 'frames/dotted_circle_preview.png', 2),
('Double Line', 'Classic double-line frame', 'profile_frame', 'common', 250, 60, 'frames/double_line.png', 'frames/double_line_preview.png', 3),

-- Uncommon Frames
('Gradient Glow', 'Subtle gradient border', 'profile_frame', 'uncommon', 500, 125, 'frames/gradient_glow.png', 'frames/gradient_glow_preview.png', 10),
('Athletic Stripe', 'Sporty striped design', 'profile_frame', 'uncommon', 500, 125, 'frames/athletic_stripe.png', 'frames/athletic_stripe_preview.png', 11),
('Pulse Ring', 'Animated pulse effect', 'profile_frame', 'uncommon', 600, 150, 'frames/pulse_ring.png', 'frames/pulse_ring_preview.png', 12),

-- Rare Frames
('Flame Border', 'Fiery animated border', 'profile_frame', 'rare', 1000, 250, 'frames/flame_border.png', 'frames/flame_border_preview.png', 20),
('Champion''s Laurel', 'Golden laurel wreath', 'profile_frame', 'rare', 1000, 250, 'frames/champion_laurel.png', 'frames/champion_laurel_preview.png', 21),
('Neon Circuit', 'Cyberpunk neon design', 'profile_frame', 'rare', 1200, 300, 'frames/neon_circuit.png', 'frames/neon_circuit_preview.png', 22),

-- Epic Frames
('Aurora Crown', 'Shimmering aurora lights', 'profile_frame', 'epic', 2000, 500, 'frames/aurora_crown.png', 'frames/aurora_crown_preview.png', 30),
('Diamond Edge', 'Sparkling diamond border', 'profile_frame', 'epic', 2000, 500, 'frames/diamond_edge.png', 'frames/diamond_edge_preview.png', 31),
('Cosmic Ring', 'Swirling galaxy effect', 'profile_frame', 'epic', 2500, 625, 'frames/cosmic_ring.png', 'frames/cosmic_ring_preview.png', 32),

-- Legendary Frames
('Phoenix Rising', 'Legendary phoenix flames', 'profile_frame', 'legendary', 5000, 1250, 'frames/phoenix_rising.png', 'frames/phoenix_rising_preview.png', 40),
('Titan''s Crown', 'Majestic golden crown', 'profile_frame', 'legendary', 5000, 1250, 'frames/titan_crown.png', 'frames/titan_crown_preview.png', 41);

-- ============================================================================
-- ACHIEVEMENT BADGES
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, asset_url, sort_order) VALUES
-- Common Badges
('Early Bird', 'First workout before 7am', 'achievement_badge', 'common', 150, 40, 'badges/early_bird.png', 1),
('Night Owl', 'Workout after 10pm', 'achievement_badge', 'common', 150, 40, 'badges/night_owl.png', 2),
('Weekend Warrior', 'Active every weekend', 'achievement_badge', 'common', 200, 50, 'badges/weekend_warrior.png', 3),

-- Uncommon Badges
('Speed Demon', 'Fast workout completion', 'achievement_badge', 'uncommon', 400, 100, 'badges/speed_demon.png', 10),
('Iron Will', '30-day consistency', 'achievement_badge', 'uncommon', 500, 125, 'badges/iron_will.png', 11),
('Social Butterfly', '10+ competition friends', 'achievement_badge', 'uncommon', 400, 100, 'badges/social_butterfly.png', 12),

-- Rare Badges
('Champion', '10 competition wins', 'achievement_badge', 'rare', 800, 200, 'badges/champion.png', 20),
('Streak Master', '100-day streak', 'achievement_badge', 'rare', 1000, 250, 'badges/streak_master.png', 21),
('Elite Competitor', '50 competitions completed', 'achievement_badge', 'rare', 900, 225, 'badges/elite_competitor.png', 22),

-- Epic Badges
('Legend', '365-day streak', 'achievement_badge', 'epic', 2500, 625, 'badges/legend.png', 30),
('Undefeated', '10 win streak', 'achievement_badge', 'epic', 2000, 500, 'badges/undefeated.png', 31);

-- Achievement-unlocked badges (not purchasable, earned through achievements)
INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, unlock_condition, asset_url, sort_order) VALUES
('Ring Closer', 'Close all rings 7 days in a row', 'achievement_badge', 'uncommon', '{"achievement_id": "ring_closer", "tier": "bronze"}', 'badges/ring_closer.png', 50),
('Calorie Crusher', 'Burn 50,000 total calories', 'achievement_badge', 'rare', '{"achievement_id": "calorie_crusher", "tier": "gold"}', 'badges/calorie_crusher.png', 51),
('Step Champion', 'Walk 1 million steps', 'achievement_badge', 'epic', '{"achievement_id": "step_champion", "tier": "platinum"}', 'badges/step_champion.png', 52);

-- ============================================================================
-- PROFILE BACKGROUNDS
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, asset_url, preview_url, sort_order) VALUES
-- Common Backgrounds
('Gradient Blue', 'Calm blue gradient', 'profile_background', 'common', 300, 75, 'backgrounds/gradient_blue.png', 'backgrounds/gradient_blue_thumb.png', 1),
('Gradient Purple', 'Royal purple gradient', 'profile_background', 'common', 300, 75, 'backgrounds/gradient_purple.png', 'backgrounds/gradient_purple_thumb.png', 2),
('Gradient Green', 'Fresh green gradient', 'profile_background', 'common', 300, 75, 'backgrounds/gradient_green.png', 'backgrounds/gradient_green_thumb.png', 3),
('Dark Carbon', 'Sleek carbon fiber', 'profile_background', 'common', 350, 85, 'backgrounds/dark_carbon.png', 'backgrounds/dark_carbon_thumb.png', 4),

-- Uncommon Backgrounds
('Mountain Sunset', 'Serene mountain view', 'profile_background', 'uncommon', 600, 150, 'backgrounds/mountain_sunset.png', 'backgrounds/mountain_sunset_thumb.png', 10),
('Ocean Wave', 'Rolling ocean waves', 'profile_background', 'uncommon', 600, 150, 'backgrounds/ocean_wave.png', 'backgrounds/ocean_wave_thumb.png', 11),
('City Lights', 'Night cityscape', 'profile_background', 'uncommon', 650, 160, 'backgrounds/city_lights.png', 'backgrounds/city_lights_thumb.png', 12),

-- Rare Backgrounds
('Northern Lights', 'Aurora borealis', 'profile_background', 'rare', 1200, 300, 'backgrounds/northern_lights.png', 'backgrounds/northern_lights_thumb.png', 20),
('Galaxy Swirl', 'Deep space nebula', 'profile_background', 'rare', 1200, 300, 'backgrounds/galaxy_swirl.png', 'backgrounds/galaxy_swirl_thumb.png', 21),
('Geometric Abstract', 'Modern geometric art', 'profile_background', 'rare', 1100, 275, 'backgrounds/geometric_abstract.png', 'backgrounds/geometric_abstract_thumb.png', 22),

-- Epic Backgrounds
('Fire & Ice', 'Contrasting elements', 'profile_background', 'epic', 2200, 550, 'backgrounds/fire_ice.png', 'backgrounds/fire_ice_thumb.png', 30),
('Dragon Scale', 'Mythical dragon pattern', 'profile_background', 'epic', 2500, 625, 'backgrounds/dragon_scale.png', 'backgrounds/dragon_scale_thumb.png', 31);

-- ============================================================================
-- APP ICONS
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, asset_url, sort_order) VALUES
-- Common Icons
('Classic Red', 'Original red theme', 'app_icon', 'common', 0, NULL, 'icons/classic_red.png', 1),  -- Free default
('Midnight Black', 'Sleek dark icon', 'app_icon', 'common', 250, 60, 'icons/midnight_black.png', 2),
('Pure White', 'Clean minimalist icon', 'app_icon', 'common', 250, 60, 'icons/pure_white.png', 3),

-- Uncommon Icons
('Ocean Blue', 'Calming blue theme', 'app_icon', 'uncommon', 500, 125, 'icons/ocean_blue.png', 10),
('Forest Green', 'Nature-inspired green', 'app_icon', 'uncommon', 500, 125, 'icons/forest_green.png', 11),
('Sunset Orange', 'Warm orange gradient', 'app_icon', 'uncommon', 500, 125, 'icons/sunset_orange.png', 12),

-- Rare Icons
('Neon Pink', 'Vibrant neon accent', 'app_icon', 'rare', 1000, 250, 'icons/neon_pink.png', 20),
('Galaxy', 'Cosmic starfield icon', 'app_icon', 'rare', 1000, 250, 'icons/galaxy.png', 21),
('Holographic', 'Iridescent effect', 'app_icon', 'rare', 1200, 300, 'icons/holographic.png', 22),

-- Epic Icons
('Golden Trophy', 'Champion''s gold icon', 'app_icon', 'epic', 2000, 500, 'icons/golden_trophy.png', 30),
('Diamond', 'Luxury diamond icon', 'app_icon', 'epic', 2500, 625, 'icons/diamond.png', 31);

-- ============================================================================
-- RING THEMES
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, theme_config, asset_url, sort_order) VALUES
-- Common Themes
('Default', 'Classic Apple-style rings', 'ring_theme', 'common', 0, NULL,
  '{"move": "#FA114F", "exercise": "#9BF00B", "stand": "#00D4FF"}', 'themes/default.png', 1),
('Monochrome', 'Elegant grayscale', 'ring_theme', 'common', 300, 75,
  '{"move": "#FFFFFF", "exercise": "#CCCCCC", "stand": "#999999"}', 'themes/monochrome.png', 2),
('Ocean Depths', 'Cool blue tones', 'ring_theme', 'common', 350, 85,
  '{"move": "#0066FF", "exercise": "#00CCFF", "stand": "#00FFFF"}', 'themes/ocean_depths.png', 3),

-- Uncommon Themes
('Sunset', 'Warm gradient colors', 'ring_theme', 'uncommon', 600, 150,
  '{"move": "#FF6B35", "exercise": "#FFD166", "stand": "#EF476F"}', 'themes/sunset.png', 10),
('Forest', 'Natural green palette', 'ring_theme', 'uncommon', 600, 150,
  '{"move": "#2D6A4F", "exercise": "#40916C", "stand": "#95D5B2"}', 'themes/forest.png', 11),
('Lavender Dreams', 'Soft purple hues', 'ring_theme', 'uncommon', 650, 160,
  '{"move": "#7B2CBF", "exercise": "#9D4EDD", "stand": "#C77DFF"}', 'themes/lavender_dreams.png', 12),

-- Rare Themes
('Neon Night', 'Cyberpunk neon', 'ring_theme', 'rare', 1200, 300,
  '{"move": "#FF00FF", "exercise": "#00FF00", "stand": "#00FFFF"}', 'themes/neon_night.png', 20),
('Fire & Ice', 'Contrasting elements', 'ring_theme', 'rare', 1200, 300,
  '{"move": "#FF4500", "exercise": "#FF8C00", "stand": "#00BFFF"}', 'themes/fire_ice.png', 21),
('Galaxy', 'Cosmic colors', 'ring_theme', 'rare', 1400, 350,
  '{"move": "#8B5CF6", "exercise": "#EC4899", "stand": "#06B6D4"}', 'themes/galaxy.png', 22),

-- Epic Themes
('Rainbow', 'Full spectrum pride', 'ring_theme', 'epic', 2000, 500,
  '{"move": "#FF0000", "exercise": "#00FF00", "stand": "#0000FF"}', 'themes/rainbow.png', 30),
('Golden Hour', 'Luxurious gold tones', 'ring_theme', 'epic', 2200, 550,
  '{"move": "#FFD700", "exercise": "#FFA500", "stand": "#FF8C00"}', 'themes/golden_hour.png', 31),
('Aurora', 'Northern lights palette', 'ring_theme', 'epic', 2500, 625,
  '{"move": "#00FF7F", "exercise": "#7FFFD4", "stand": "#DA70D6"}', 'themes/aurora.png', 32),

-- Legendary Themes
('Phoenix', 'Legendary fire theme', 'ring_theme', 'legendary', 5000, 1250,
  '{"move": "#FF2400", "exercise": "#FF7F00", "stand": "#FFD700"}', 'themes/phoenix.png', 40),
('Diamond', 'Brilliant sparkle effect', 'ring_theme', 'legendary', 5000, 1250,
  '{"move": "#B9F2FF", "exercise": "#E0FFFF", "stand": "#FFFFFF"}', 'themes/diamond.png', 41);

-- ============================================================================
-- STREAK FREEZES (Consumable)
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, is_consumable, consumable_duration_hours, consumable_effect, asset_url, sort_order) VALUES
('Streak Freeze', 'Protect your streak for 24 hours if you miss a day', 'streak_freeze', 'common', 100, 25, TRUE, 24,
  '{"protects_streak": true, "duration_hours": 24}', 'consumables/streak_freeze.png', 1),
('Super Streak Freeze', 'Protect your streak for 48 hours', 'streak_freeze', 'uncommon', 175, 45, TRUE, 48,
  '{"protects_streak": true, "duration_hours": 48}', 'consumables/super_streak_freeze.png', 2),
('Ultra Streak Freeze', 'Protect your streak for 72 hours', 'streak_freeze', 'rare', 250, 60, TRUE, 72,
  '{"protects_streak": true, "duration_hours": 72}', 'consumables/ultra_streak_freeze.png', 3);

-- ============================================================================
-- COMPETITION BOOSTS (Consumable)
-- ============================================================================

INSERT INTO cosmetic_items (name, description, cosmetic_type, rarity, earned_coin_price, premium_coin_price, is_consumable, consumable_effect, asset_url, sort_order) VALUES
('Competition Boost', '+10% bonus to your final competition score', 'competition_boost', 'uncommon', 150, 40, TRUE,
  '{"bonus_percentage": 10, "applies_to": "final_score"}', 'consumables/competition_boost.png', 1),
('Super Boost', '+15% bonus to your final competition score', 'competition_boost', 'rare', 250, 60, TRUE,
  '{"bonus_percentage": 15, "applies_to": "final_score"}', 'consumables/super_boost.png', 2),
('Mega Boost', '+25% bonus to your final competition score', 'competition_boost', 'epic', 400, 100, TRUE,
  '{"bonus_percentage": 25, "applies_to": "final_score"}', 'consumables/mega_boost.png', 3);

-- ============================================================================
-- IAP COIN BUNDLES
-- ============================================================================

INSERT INTO iap_coin_products (revenuecat_product_id, name, description, premium_coins, bonus_coins, price_usd, sort_order, is_featured) VALUES
('coins_starter', 'Starter Pack', 'Perfect for trying cosmetics', 100, 0, 0.99, 1, FALSE),
('coins_small', 'Small Bundle', 'Great value pack', 500, 50, 4.99, 2, FALSE),
('coins_medium', 'Medium Bundle', 'Most popular choice', 1200, 200, 9.99, 3, TRUE),
('coins_large', 'Large Bundle', 'Big savings', 2500, 500, 19.99, 4, FALSE),
('coins_mega', 'Mega Bundle', 'Best value', 6500, 1500, 49.99, 5, FALSE);
