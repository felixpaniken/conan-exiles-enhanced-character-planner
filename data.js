// Conan Exiles 3.0+ attribute & perk data
// Source: https://conanexiles.fandom.com/wiki/Attribute

const MAX_LEVEL = 60;
const MAX_AP = 60;
const MAX_PER_ATTR = 20;
const PERK_TIERS = [5, 10, 15, 20];

const ATTRIBUTES = [
  {
    id: 'strength',
    icon: 'sword',
    name: 'Strength',
    blurb: 'Damage with strength-based weapons and carry weight.',
    perPoint: [
      '+5% strength-weapon damage',
      '+0.5% agility-weapon damage',
      '+3 carry weight',
    ],
    corruptable: true,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Heavy Blows', desc: 'Heavy and special attacks deal 10% more damage.' }] },
        { tier: 10, choices: [
          { name: 'Combo Master', desc: 'Combo finishers deal 20% more damage.' },
          { name: 'Second Skin', desc: 'Equipped armor weighs 25% less.' },
        ]},
        { tier: 15, choices: [{ name: 'Berserker', desc: 'While below 50% health, you deal 25% more damage and gain 100 armor.' }] },
        { tier: 20, choices: [
          { name: 'Blood-mad Berserker', desc: 'While below 25% health, you cannot be staggered or knocked down, +10% damage, +50 armor.' },
          { name: 'Crushing Swings', desc: 'Heavy attacks stagger 25% longer and no longer rebound off shields.' },
        ]},
      ],
      corrupted: [
        { tier: 5, choices: [{ name: 'Scourge', desc: 'Deal additional damage that scales with corrupted Strength (+1% per point).' }] },
        { tier: 10, choices: [{ name: 'Mule Kick', desc: 'Your kick knocks enemies back farther and knocks them down.' }] },
        { tier: 15, choices: [{ name: 'Wrack', desc: 'Your strikes reduce enemy damage by 25% for 4 seconds.' }] },
        { tier: 20, choices: [{ name: 'Desecrate', desc: '5% chance on damage to vent corruption from the earth, knocking down and damaging enemies (50 dmg, 1.5s cd).' }] },
      ],
    },
  },
  {
    id: 'agility',
    icon: 'wind',
    name: 'Agility',
    blurb: 'Damage with agility-based weapons, post-dodge speed, and stamina.',
    perPoint: [
      '+5% agility-weapon damage',
      '+0.5% strength-weapon damage',
      '+1 stamina',
      'Faster action after a dodge',
    ],
    corruptable: false,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Backstab', desc: 'Deal 15% increased damage when attacking from behind.' }] },
        { tier: 10, choices: [
          { name: 'Dead Shot', desc: 'Arrows and thrown weapons travel twice as quickly and deal 15% more damage to distant targets.' },
          { name: 'Precision Strike', desc: '10% additional armor penetration while carrying a medium or lighter load.' },
        ]},
        { tier: 15, choices: [{ name: 'Quickfooted', desc: 'Jogging, sprinting, jumping, swimming, and climbing cost less stamina and are faster.' }] },
        { tier: 20, choices: [
          { name: 'Extended Leap', desc: 'Jump while in the air to do a second jump.' },
          { name: 'Rolling Thrust', desc: 'After dodging, your next attack has +25% penetration and costs no stamina.' },
        ]},
      ],
    },
  },
  {
    id: 'vitality',
    icon: 'heart-pulse',
    name: 'Vitality',
    blurb: 'Maximum health pool.',
    perPoint: ['+10% of base health (+20 HP at 200 base)'],
    corruptable: true,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Fierce Vitality', desc: 'Passive health regeneration of +0.5.' }] },
        { tier: 10, choices: [
          { name: 'Resurgence', desc: 'One-time healing effect when health drops below 50%. Refreshes when fully healed.' },
          { name: 'Fast Healer', desc: 'Receive 50% increased healing from healing effects.' },
        ]},
        { tier: 15, choices: [{ name: 'Robust', desc: 'Increases maximum health by 100.' }] },
        { tier: 20, choices: [
          { name: 'Last Stand', desc: 'Below 50% health: remove all negative effects, gain 95% damage mitigation for 5 seconds.' },
          { name: 'Glutton for Punishment', desc: 'When you take damage, regenerate the last instance of damage taken over 15 seconds.' },
        ]},
      ],
      corrupted: [
        { tier: 5, choices: [{ name: 'Grotesque Excrescence', desc: 'Passive health regen that scales with corrupted Vitality (+0.2/pt).' }] },
        { tier: 10, choices: [{ name: 'Twisted Flesh', desc: 'Chance to deflect damage. Scales with corrupted Vitality (+0.5%/pt).' }] },
        { tier: 15, choices: [{ name: 'Petrified', desc: 'Immune to bleed, poison, disease, and sunder effects.' }] },
        { tier: 20, choices: [{ name: 'Tainted Vessel', desc: 'On damage taken, expel corruption dealing 30 dmg in an area (1.5s cd).' }] },
      ],
    },
  },
  {
    id: 'authority',
    icon: 'crown',
    name: 'Authority',
    blurb: 'Follower damage and concussive damage.',
    perPoint: [
      '+4% follower damage (lethal only)',
      '+6% concussive damage',
    ],
    corruptable: true,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Irritate', desc: 'Active followers goad enemies, forcing them to attack the follower.' }] },
        { tier: 10, choices: [
          { name: 'Commanding Presence', desc: 'Active followers heal for 5% of damage you deal in combat.' },
          { name: 'Healthy Diet', desc: 'Active followers gain +10 passive health regen when out of combat for 10s.' },
        ]},
        { tier: 15, choices: [{ name: 'Attentive Care', desc: 'Active followers receive 50% increased healing.' }] },
        { tier: 20, choices: [
          { name: 'Well-Trained', desc: 'Active followers gain +20 to all attributes.' },
          { name: 'War Party', desc: 'Maximum followers +1, but your stats no longer influence follower damage.' },
        ]},
      ],
      corrupted: [
        { tier: 5, choices: [{ name: 'Frenzy', desc: 'When you deal damage, followers enter Frenzy: +3% damage per corrupted Authority point for 10s.' }] },
        { tier: 10, choices: [{ name: 'Flesh Bond', desc: '33% of damage you take is also dealt to every follower.' }] },
        { tier: 15, choices: [{ name: 'Devour', desc: 'You heal for 2% of damage dealt by your followers.' }] },
        { tier: 20, choices: [{ name: 'Demon-Lord', desc: '7% chance on damage to summon an uncontrolled demon (22.5s).' }] },
      ],
    },
  },
  {
    id: 'grit',
    icon: 'hand-fist',
    name: 'Grit',
    blurb: 'Stamina pool and armor.',
    perPoint: ['+3 stamina', '+8 armor'],
    corruptable: false,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Tenacity', desc: '+40 armor and +20 stamina.' }] },
        { tier: 10, choices: [
          { name: 'Endurance', desc: 'Stamina regenerates 25% faster.' },
          { name: 'Stout', desc: 'Increase your armor by 1/5 of your current stamina.' },
        ]},
        { tier: 15, choices: [{ name: 'Defensive Posture', desc: 'Incoming damage reduced by 15% while attacking or blocking.' }] },
        { tier: 20, choices: [
          { name: 'Shield Master', desc: 'Block unblockable attacks (higher stamina cost) and react twice as quickly after a successful block.' },
          { name: 'Steel Thewed', desc: 'You cannot take more than 33% of your maximum health in damage per hit.' },
        ]},
      ],
    },
  },
  {
    id: 'expertise',
    icon: 'pickaxe',
    name: 'Expertise',
    blurb: 'Carry weight and harvesting efficiency.',
    perPoint: ['+15 max carry weight'],
    corruptable: false,
    perks: {
      normal: [
        { tier: 5, choices: [{ name: 'Survivalist', desc: 'Tools lose durability half as quickly; hunger and thirst deplete 33% slower.' }] },
        { tier: 10, choices: [
          { name: 'Efficient Harvest', desc: 'Final hit when harvesting grants twice as many resources.' },
          { name: 'Careful Harvest', desc: 'Twice as likely to gather rare resources when harvesting.' },
        ]},
        { tier: 15, choices: [{ name: 'Hard Worker', desc: 'You harvest resource nodes twice as fast.' }] },
        { tier: 20, choices: [
          { name: 'Beast of Burden', desc: 'When over-encumbered, you can dodge and move at full speed.' },
          { name: 'Structural Integrity', desc: 'Structures you build are 25% more stable.' },
        ]},
      ],
    },
  },
];
