/**
 * Bundled fallback opponent decks — complete 100-card Commander lists used
 * when the EDHREC fetch fails or is offline. Card data still resolves through
 * the normal Scryfall path (and its IndexedDB cache).
 */

export interface FallbackDeck {
  name: string;
  commander: string;
  list: string;
}

export const FALLBACK_DECKS: FallbackDeck[] = [
  {
    name: "Krenko Goblin Swarm (bundled)",
    commander: "Krenko, Mob Boss",
    list: `1 Krenko, Mob Boss *CMDR*
1 Skirk Prospector
1 Goblin Lackey
1 Fanatical Firebrand
1 Goblin Piledriver
1 Goblin Bushwhacker
1 Mogg War Marshal
1 Goblin Matron
1 Goblin Warchief
1 Goblin Chieftain
1 Goblin King
1 Goblin Recruiter
1 Goblin Ringleader
1 Goblin Rabblemaster
1 Legion Warboss
1 Goblin Sharpshooter
1 Goblin Trashmaster
1 Siege-Gang Commander
1 Beetleback Chief
1 Goblin Instigator
1 Goblin Cratermaker
1 Goblin Chainwhirler
1 Pashalik Mons
1 Zealous Conscripts
1 Purphoros, God of the Forge
1 Dark-Dweller Oracle
1 Goblin Engineer
1 Goblin Welder
1 Hellrider
1 Hobgoblin Bandit Lord
1 Muxus, Goblin Grandee
1 Sol Ring
1 Arcane Signet
1 Ruby Medallion
1 Mind Stone
1 Fire Diamond
1 Skullclamp
1 Lightning Bolt
1 Chaos Warp
1 Abrade
1 Vandalblast
1 Goblin Grenade
1 Dragon Fodder
1 Krenko's Command
1 Hordeling Outburst
1 Empty the Warrens
1 Goblin War Strike
1 Massive Raid
1 Faithless Looting
1 Reforge the Soul
1 Big Score
1 Impact Tremors
1 Outpost Siege
1 Fervor
1 Shared Animosity
1 Coat of Arms
1 Door of Destinies
1 Obelisk of Urd
1 Eldrazi Monument
1 Throne of the God-Pharaoh
1 Goblin Bombardment
1 Goblin Burrows
1 Buried Ruin
1 Great Furnace
1 Forgotten Cave
1 Smoldering Crater
1 Myriad Landscape
33 Mountain`,
  },
  {
    name: "Talrand Drake Storm (bundled)",
    commander: "Talrand, Sky Summoner",
    list: `1 Talrand, Sky Summoner *CMDR*
1 Baral, Chief of Compliance
1 Murmuring Mystic
1 Docent of Perfection
1 Archaeomancer
1 Sea Gate Oracle
1 Snapcaster Mage
1 Gadwick, the Wizened
1 Glint-Nest Crane
1 Counterspell
1 Negate
1 Essence Scatter
1 Swan Song
1 Arcane Denial
1 Dissolve
1 Sinister Sabotage
1 Mystic Confluence
1 Cryptic Command
1 Rewind
1 Dissipate
1 Insidious Will
1 Wizard's Retort
1 Spell Pierce
1 Mana Leak
1 Opt
1 Ponder
1 Preordain
1 Brainstorm
1 Serum Visions
1 Sleight of Hand
1 Consider
1 Frantic Search
1 Windfall
1 Fact or Fiction
1 Chart a Course
1 Treasure Cruise
1 Dig Through Time
1 Blue Sun's Zenith
1 Pull from Tomorrow
1 Cyclonic Rift
1 Evacuation
1 Curse of the Swine
1 Pongify
1 Rapid Hybridization
1 Reality Shift
1 Snap
1 Unsummon
1 Vapor Snag
1 Aetherize
1 Engulf the Shore
1 River's Rebuke
1 Sol Ring
1 Arcane Signet
1 Sapphire Medallion
1 Mind Stone
1 Thought Vessel
1 Commander's Sphere
1 Wayfarer's Bauble
1 Swiftfoot Boots
1 Lightning Greaves
1 Propaganda
1 Rhystic Study
1 Mystic Remora
1 Reliquary Tower
1 Myriad Landscape
1 Halimar Depths
1 Lonely Sandbar
33 Island`,
  },
];
