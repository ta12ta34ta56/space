/**
 * Built-in themed word lists.
 *
 * A word-search book is really a book of *themes*, so the module ships enough
 * ready-made lists to fill a 50-puzzle KDP title without the author typing a
 * single word. Every list is at least 24 words so it can feed easy (8 words)
 * through expert (22 words) puzzles without repeating.
 */

export interface WordBank {
  id: string;
  name: string;
  audience: 'kids' | 'general' | 'adult';
  words: string[];
}

export const WORD_BANKS: WordBank[] = [
  {
    id: 'animals',
    name: 'Animals',
    audience: 'kids',
    words: [
      'ELEPHANT', 'GIRAFFE', 'DOLPHIN', 'PENGUIN', 'TIGER', 'ZEBRA', 'MONKEY',
      'RABBIT', 'HORSE', 'KANGAROO', 'LEOPARD', 'OCTOPUS', 'SQUIRREL', 'TORTOISE',
      'BUFFALO', 'CHEETAH', 'HEDGEHOG', 'FLAMINGO', 'RACCOON', 'WALRUS',
      'PANDA', 'OTTER', 'BADGER', 'LIZARD', 'CAMEL', 'FALCON',
    ],
  },
  {
    id: 'fruits',
    name: 'Fruit & veg',
    audience: 'kids',
    words: [
      'APPLE', 'BANANA', 'CHERRY', 'MANGO', 'ORANGE', 'PEACH', 'PINEAPPLE',
      'STRAWBERRY', 'WATERMELON', 'BLUEBERRY', 'APRICOT', 'CARROT', 'PUMPKIN',
      'SPINACH', 'BROCCOLI', 'CUCUMBER', 'POTATO', 'TOMATO', 'LETTUCE',
      'PEPPER', 'ONION', 'CABBAGE', 'RADISH', 'CELERY', 'AVOCADO', 'LEMON',
    ],
  },
  {
    id: 'ocean',
    name: 'Under the sea',
    audience: 'kids',
    words: [
      'DOLPHIN', 'STARFISH', 'SEAWEED', 'CORAL', 'LOBSTER', 'JELLYFISH',
      'SEAHORSE', 'STINGRAY', 'ANCHOR', 'HARBOUR', 'CURRENT', 'LAGOON',
      'PLANKTON', 'BARNACLE', 'MARLIN', 'HERRING', 'MUSSEL', 'OYSTER',
      'TIDE', 'WAVE', 'REEF', 'SHELL', 'SAILOR', 'ISLAND', 'PEARL', 'WHALE',
    ],
  },
  {
    id: 'space',
    name: 'Space',
    audience: 'kids',
    words: [
      'PLANET', 'COMET', 'GALAXY', 'ASTEROID', 'ORBIT', 'ROCKET', 'SATURN',
      'JUPITER', 'MERCURY', 'NEPTUNE', 'TELESCOPE', 'ASTRONAUT', 'GRAVITY',
      'METEOR', 'NEBULA', 'ECLIPSE', 'CRATER', 'LAUNCH', 'SHUTTLE', 'COSMOS',
      'STARDUST', 'URANUS', 'VENUS', 'SOLAR', 'LUNAR', 'ROVER',
    ],
  },
  {
    id: 'kitchen',
    name: 'In the kitchen',
    audience: 'general',
    words: [
      'SKILLET', 'WHISK', 'SPATULA', 'COLANDER', 'TEAPOT', 'KETTLE', 'BLENDER',
      'TOASTER', 'GRATER', 'LADLE', 'ROLLING', 'CUTTING', 'MEASURE', 'SIMMER',
      'KNEAD', 'MARINATE', 'GARNISH', 'PANTRY', 'RECIPE', 'APRON', 'OVEN',
      'SAUCEPAN', 'STRAINER', 'PEELER', 'CINNAMON', 'VANILLA',
    ],
  },
  {
    id: 'garden',
    name: 'Garden',
    audience: 'general',
    words: [
      'BLOSSOM', 'TRELLIS', 'COMPOST', 'SEEDLING', 'PRUNING', 'GREENHOUSE',
      'LAVENDER', 'SUNFLOWER', 'MARIGOLD', 'HYDRANGEA', 'WISTERIA', 'TULIP',
      'DAFFODIL', 'ORCHID', 'FERN', 'MOSS', 'HEDGE', 'ARBOUR', 'MULCH',
      'WATERING', 'SPROUT', 'PETAL', 'ROOTS', 'THORN', 'ORCHARD', 'MEADOW',
    ],
  },
  {
    id: 'weather',
    name: 'Weather',
    audience: 'general',
    words: [
      'THUNDER', 'LIGHTNING', 'DRIZZLE', 'BLIZZARD', 'HURRICANE', 'TORNADO',
      'MONSOON', 'OVERCAST', 'HUMIDITY', 'FORECAST', 'BAROMETER', 'SUNSHINE',
      'RAINBOW', 'HAILSTONE', 'SNOWFLAKE', 'BREEZE', 'CLOUD', 'FROST',
      'SLEET', 'GALE', 'MIST', 'CLIMATE', 'PRESSURE', 'CYCLONE', 'DROUGHT',
      'SHOWER',
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    audience: 'adult',
    words: [
      'PASSPORT', 'SUITCASE', 'AIRPORT', 'TERMINAL', 'BOARDING', 'ITINERARY',
      'LUGGAGE', 'JOURNEY', 'VOYAGE', 'CUSTOMS', 'HOSTEL', 'RAILWAY',
      'CARRIAGE', 'SOUVENIR', 'LANDMARK', 'CULTURE', 'BACKPACK', 'DEPARTURE',
      'ARRIVAL', 'TRANSIT', 'HARBOUR', 'COMPASS', 'MAPS', 'SEASIDE',
      'MOUNTAIN', 'ADVENTURE',
    ],
  },
  {
    id: 'mindfulness',
    name: 'Calm & mindfulness',
    audience: 'adult',
    words: [
      'BREATHE', 'PRESENT', 'GRATITUDE', 'STILLNESS', 'BALANCE', 'CLARITY',
      'COMPASSION', 'PATIENCE', 'SERENITY', 'REFLECT', 'GROUNDED', 'KINDNESS',
      'RELEASE', 'AWARENESS', 'HARMONY', 'NOURISH', 'INTENTION', 'SOFTEN',
      'RESTORE', 'EMBRACE', 'JOURNAL', 'SUNRISE', 'QUIET', 'GENTLE', 'PAUSE',
      'TRUST',
    ],
  },
  {
    id: 'sports',
    name: 'Sports',
    audience: 'general',
    words: [
      'FOOTBALL', 'BASKETBALL', 'CRICKET', 'TENNIS', 'SWIMMING', 'CYCLING',
      'MARATHON', 'HOCKEY', 'ROWING', 'BOXING', 'ARCHERY', 'FENCING',
      'GYMNASTICS', 'SKIING', 'SURFING', 'CLIMBING', 'REFEREE', 'STADIUM',
      'TROPHY', 'MEDAL', 'COACH', 'DEFENCE', 'PENALTY', 'VICTORY', 'RELAY',
      'SPRINT',
    ],
  },
  {
    id: 'jobs',
    name: 'Jobs',
    audience: 'kids',
    words: [
      'TEACHER', 'DOCTOR', 'FARMER', 'BAKER', 'PILOT', 'NURSE', 'DENTIST',
      'ENGINEER', 'ARCHITECT', 'PLUMBER', 'ELECTRICIAN', 'LIBRARIAN',
      'SCIENTIST', 'MECHANIC', 'FIREFIGHTER', 'CARPENTER', 'JOURNALIST',
      'DESIGNER', 'CHEF', 'ARTIST', 'VET', 'POLICE', 'TAILOR', 'JUDGE',
      'BARBER', 'FLORIST',
    ],
  },
  {
    id: 'body',
    name: 'Human body',
    audience: 'general',
    words: [
      'SHOULDER', 'ELBOW', 'ANKLE', 'STOMACH', 'MUSCLE', 'SKELETON', 'ARTERY',
      'KIDNEY', 'LIVER', 'BRAIN', 'HEART', 'LUNGS', 'SPINE', 'THUMB',
      'KNUCKLE', 'EYEBROW', 'TENDON', 'NERVE', 'TISSUE', 'PULSE', 'JOINT',
      'RIBS', 'WRIST', 'THROAT', 'VEIN', 'SKIN',
    ],
  },
  {
    id: 'countries',
    name: 'Countries',
    audience: 'adult',
    words: [
      'BRAZIL', 'CANADA', 'MOROCCO', 'NORWAY', 'PORTUGAL', 'THAILAND',
      'AUSTRALIA', 'ARGENTINA', 'ETHIOPIA', 'MALAYSIA', 'DENMARK', 'IRELAND',
      'ICELAND', 'JAPAN', 'MEXICO', 'TURKEY', 'GREECE', 'EGYPT', 'KENYA',
      'FINLAND', 'POLAND', 'PERU', 'CHILE', 'INDIA', 'SPAIN', 'VIETNAM',
    ],
  },
  {
    id: 'school',
    name: 'School',
    audience: 'kids',
    words: [
      'PENCIL', 'ERASER', 'NOTEBOOK', 'BACKPACK', 'TEACHER', 'HOMEWORK',
      'LIBRARY', 'SCIENCE', 'HISTORY', 'GEOGRAPHY', 'MATHS', 'READING',
      'SPELLING', 'PLAYGROUND', 'CLASSROOM', 'LESSON', 'RULER', 'CRAYON',
      'SCISSORS', 'PROJECT', 'ASSEMBLY', 'FRIENDS', 'CHALK', 'DESK',
      'REPORT', 'EXAM',
    ],
  },
];

