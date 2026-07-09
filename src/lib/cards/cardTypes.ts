/**
 * Curated MTG type/subtype vocabulary for the search type-ahead. The search
 * engine matches each chosen term as a substring of the card's type line, so
 * "Aura", "Adventure", or "Elf" all narrow correctly. The list isn't
 * exhaustive — the combobox also allows free-text entry, so any printed type
 * still works even if it isn't listed here.
 */

/** Core card types + supertypes (the broad buckets). */
export const CARD_TYPES = [
  "Creature",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Battle",
  "Land",
  "Legendary",
  "Basic",
  "Snow",
  "Token",
] as const;

/** Non-creature subtypes worth differentiating (the user's examples live here). */
const OTHER_SUBTYPES = [
  // Enchantment
  "Aura",
  "Saga",
  "Class",
  "Room",
  "Shrine",
  "Curse",
  "Cartouche",
  "Rune",
  "Shard",
  "Background",
  // Artifact
  "Equipment",
  "Vehicle",
  "Fortification",
  "Food",
  "Clue",
  "Treasure",
  "Blood",
  "Powerstone",
  "Map",
  "Gold",
  "Contraption",
  "Attraction",
  // Instant / sorcery
  "Adventure",
  "Arcane",
  "Trap",
  "Lesson",
  // Land
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Gate",
  "Locus",
  "Desert",
  "Cave",
  "Sphere",
  "Town",
  // Planeswalker (representative)
  "Jace",
  "Liliana",
  "Chandra",
  "Teferi",
  // Battle
  "Siege",
] as const;

/** Creature (and tribal) types. Broad, not exhaustive — free-text covers the rest. */
const CREATURE_TYPES = [
  "Advisor", "Aetherborn", "Alien", "Ally", "Angel", "Antelope", "Ape", "Archer", "Archon",
  "Armadillo", "Army", "Artificer", "Assassin", "Assembly-Worker", "Astartes", "Atog", "Aurochs",
  "Avatar", "Azra", "Badger", "Balloon", "Barbarian", "Bard", "Basilisk", "Bat", "Bear", "Beast",
  "Beaver", "Beeble", "Beholder", "Berserker", "Bird", "Blinkmoth", "Boar", "Bringer", "Brushwagg",
  "Camarid", "Camel", "Capybara", "Caribou", "Carrier", "Cat", "Centaur", "Cephalid", "Child",
  "Chimera", "Citizen", "Cleric", "Clown", "Cockatrice", "Construct", "Coward", "Coyote", "Crab",
  "Crocodile", "Ctan", "Custodes", "Cyberman", "Cyclops", "Dalek", "Dauthi", "Demigod", "Demon",
  "Deserter", "Detective", "Devil", "Dinosaur", "Djinn", "Doctor", "Dog", "Dragon", "Drake",
  "Dreadnought", "Drone", "Druid", "Dryad", "Dwarf", "Efreet", "Egg", "Elder", "Eldrazi", "Elemental",
  "Elephant", "Elf", "Elk", "Employee", "Eye", "Faerie", "Ferret", "Fish", "Flagbearer", "Fox",
  "Fractal", "Frog", "Fungus", "Gamer", "Gargoyle", "Germ", "Giant", "Gith", "Glimmer", "Gnoll",
  "Gnome", "Goat", "Goblin", "God", "Golem", "Gorgon", "Graveborn", "Gremlin", "Griffin", "Guest",
  "Hag", "Halfling", "Hamster", "Harpy", "Hellion", "Hippo", "Hippogriff", "Homarid", "Homunculus",
  "Horror", "Horse", "Human", "Hydra", "Hyena", "Illusion", "Imp", "Incarnation", "Inkling",
  "Inquisitor", "Insect", "Jackal", "Jellyfish", "Juggernaut", "Kavu", "Kirin", "Kithkin", "Knight",
  "Kobold", "Kor", "Kraken", "Llama", "Lamia", "Lammasu", "Leech", "Leviathan", "Lhurgoyf", "Licid",
  "Lizard", "Manticore", "Masticore", "Mercenary", "Merfolk", "Metathran", "Minion", "Minotaur",
  "Mite", "Mole", "Monger", "Mongoose", "Monk", "Monkey", "Moonfolk", "Mouse", "Mutant", "Myr",
  "Mystic", "Naga", "Nautilus", "Necron", "Nephilim", "Nightmare", "Nightstalker", "Ninja", "Noble",
  "Noggle", "Nomad", "Nymph", "Octopus", "Ogre", "Ooze", "Orb", "Orc", "Orgg", "Otter", "Ouphe",
  "Ox", "Oyster", "Pangolin", "Peasant", "Pegasus", "Pentavite", "Performer", "Pest", "Phelddagrif",
  "Phoenix", "Phyrexian", "Pilot", "Pincher", "Pirate", "Plant", "Porcupine", "Possum", "Praetor",
  "Primarch", "Prism", "Processor", "Rabbit", "Raccoon", "Ranger", "Rat", "Rebel", "Reflection",
  "Rhino", "Rigger", "Robot", "Rogue", "Sable", "Salamander", "Samurai", "Sand", "Saproling",
  "Satyr", "Scarecrow", "Scientist", "Scion", "Scorpion", "Scout", "Sculpture", "Serf", "Serpent",
  "Servo", "Shade", "Shaman", "Shapeshifter", "Shark", "Sheep", "Siren", "Skeleton", "Skunk", "Slith",
  "Sliver", "Sloth", "Slug", "Snail", "Snake", "Soldier", "Soltari", "Spawn", "Specter",
  "Spellshaper", "Sphinx", "Spider", "Spike", "Spirit", "Splinter", "Sponge", "Squid", "Squirrel",
  "Starfish", "Surrakar", "Survivor", "Synth", "Tentacle", "Tetravite", "Thalakos", "Thopter",
  "Thrull", "Tiefling", "Time Lord", "Toy", "Treefolk", "Trilobite", "Triskelavite", "Troll",
  "Turtle", "Tyranid", "Unicorn", "Vampire", "Varmint", "Vedalken", "Viashino", "Volver", "Wall",
  "Walrus", "Warlock", "Warrior", "Weird", "Werewolf", "Whale", "Wizard", "Wolf", "Wolverine",
  "Wombat", "Worm", "Wraith", "Wurm", "Yeti", "Zombie", "Zubera",
];

/** All type/subtype options for the search combobox, de-duplicated. */
export const TYPE_OPTIONS: string[] = [
  ...new Set<string>([...CARD_TYPES, ...OTHER_SUBTYPES, ...CREATURE_TYPES]),
];
