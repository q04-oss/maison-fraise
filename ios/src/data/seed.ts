export interface Strawberry {
  id: string;
  name: string;
  farm: string;
  description: string;
  price: number;
  harvestDate: string;
  quantity: number;
  quantityLabel: string;
  tag?: string;
  tab: 'CANADIAN' | 'INTERNATIONAL' | 'SEASONS';
  flag: string;
  freshnessLevel: number;
  freshnessColor: string;
  isPreOrder?: boolean;
}

export interface Chocolate {
  id: string;
  name: string;
  source: string;
  description: string;
  tagline: string;
  swatchColor: string;
  tag?: string;
}

export interface Finish {
  id: string;
  name: string;
  description: string;
  tagline: string;
  tag?: string;
}

export interface CollectionLocation {
  id: string;
  name: string;
  detail: string;
}

export interface TimeSlot {
  time: string;
  slots: number;
}

export const STRAWBERRIES: Strawberry[] = [
  {
    id: 'greenhouse-reserve',
    name: 'Greenhouse Reserve',
    farm: 'Our greenhouse, Ontario',
    description:
      'Our own variety. Unnamed. Grown in eight plants. Unavailable anywhere else.',
    price: 8.5,
    harvestDate: 'Harvested this morning',
    quantity: 8,
    quantityLabel: '8 today · Pre-order',
    tag: 'GREENHOUSE',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 1.0,
    freshnessColor: '#007AFF',
    isPreOrder: true,
  },
  {
    id: 'jewel',
    name: 'Jewel',
    farm: 'Ferme Carpentier, Saint-Jean-sur-Richelieu, QC',
    description:
      'The great Quebec strawberry. Bright, firm, slightly tart. The one this province is built around.',
    price: 5.5,
    harvestDate: 'Harvested yesterday',
    quantity: 42,
    quantityLabel: '42 remaining',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 0.72,
    freshnessColor: '#007AFF',
  },
  {
    id: 'seascape',
    name: 'Seascape',
    farm: 'Krause Berry Farms, Langley, BC',
    description:
      'A BC strawberry. Sweeter than Jewel, more fragile. A West Coast story.',
    price: 6.0,
    harvestDate: 'Harvested two days ago',
    quantity: 18,
    quantityLabel: '18 remaining',
    tab: 'CANADIAN',
    flag: '🇨🇦',
    freshnessLevel: 0.48,
    freshnessColor: '#007AFF',
  },
];

export const CHOCOLATES: Chocolate[] = [
  {
    id: 'none',
    name: 'No chocolate',
    source: 'Plain strawberry',
    description: 'The strawberry, unadorned.',
    tagline: 'As nature intended.',
    swatchColor: '#E8D5C4',
    tag: 'PLAIN',
  },
  {
    id: 'guanaja_70',
    name: 'Guanaja 70%',
    source: 'Valrhona, Rhône Valley',
    description: 'Complex. Slightly bitter. A long finish.',
    tagline: 'The serious choice.',
    swatchColor: '#3D1F0F',
  },
  {
    id: 'caraibe_66',
    name: 'Caraïbe 66%',
    source: 'Valrhona, Rhône Valley',
    description: 'Rounder. More forgiving.',
    tagline: 'Most people begin here.',
    swatchColor: '#7A3B12',
  },
  {
    id: 'jivara_40',
    name: 'Jivara 40% Lait',
    source: 'Valrhona, Rhône Valley',
    description: 'Milk chocolate with caramel notes.',
    tagline: 'For those who know.',
    swatchColor: '#A67C52',
  },
];

export const FINISHES: Finish[] = [
  {
    id: 'plain',
    name: 'Plain',
    description: 'The chocolate as it sets. Nothing added.',
    tagline: 'Honest.',
  },
  {
    id: 'fleur_de_sel',
    name: 'Fleur de Sel',
    description: 'Three flakes of Île de Ré salt.',
    tagline: 'Most people choose this one.',
    tag: 'RECOMMENDED',
  },
  {
    id: 'or_fin',
    name: 'Or Fin',
    description: 'A touch of gold leaf at the shoulder.',
    tagline: 'Occasions only.',
  },
];

export const QUANTITIES = [1, 4, 8, 12];

export interface MenuItem {
  item: string;
  description?: string;
  price?: string;
  tags?: string[];
  addOns?: { item: string; price: string }[];
}

export interface MenuSection {
  section: string;
  note?: string;
  items: MenuItem[];
}

export interface PartnerMenu {
  label: string;
  sections: MenuSection[];
}

const ACE_COFFEE_MENU: PartnerMenu[] = [
  {
    label: 'MENU',
    sections: [
      {
        section: 'COFFEE',
        items: [
          { item: 'Espresso', price: '$3.75' },
          { item: 'Americano', price: '$4.50' },
          { item: 'Macchiato', price: '$4.50' },
          { item: 'Cortado', price: '$5.50' },
          { item: 'Cappuccino', price: '$5.75' },
          { item: 'Flat White', price: '$5.75' },
          { item: 'Latte', price: '$6.50' },
          { item: 'Drip', description: '10oz / 16oz', price: '$3.50 / $4.00' },
        ],
      },
      {
        section: 'TEA',
        items: [
          { item: 'Chai Latte', price: '$6.50' },
          { item: 'London Fog', price: '$6.50' },
          { item: 'Tea', price: '$4.00' },
        ],
      },
      {
        section: 'ADD-ONS',
        note: 'Select drinks only',
        items: [
          { item: 'Alternative Milk', price: '+$1.00' },
          { item: 'Vanilla / Chocolate', price: '+$0.75' },
        ],
      },
      {
        section: 'EGGERS',
        note: '8am – 2pm',
        items: [
          { item: 'Maple Infused Ham Egger', price: '$9.20' },
          { item: 'Bacon Egger', price: '$10.00' },
          { item: 'Veggie Egger', price: '$9.20' },
        ],
      },
      {
        section: 'LUNCH SANDWICHES',
        note: '11am – 2pm',
        items: [
          { item: 'Mortadella', price: '$8.50' },
          { item: 'Prosciutto Crudo & Bocconcini', price: '$8.50' },
          { item: 'Roast Turkey', price: '$9.00' },
        ],
      },
      {
        section: 'BAGELS',
        note: '8am – 2pm',
        items: [
          { item: 'Herb & Cream Cheese', price: '$8.50' },
          { item: 'Gravlax', price: '$16.25' },
          { item: 'Tomato & Avocado', price: '$12.25' },
          { item: 'Add Avocado', price: '+$2.00' },
        ],
      },
      {
        section: 'DONUTS',
        items: [
          { item: 'Donut Ring', price: '$3.75' },
          { item: 'Bomboloni', price: '$4.75' },
        ],
      },
    ],
  },
];

const FARROW_MENU: PartnerMenu[] = [
  {
    label: 'MENU',
    sections: [
      {
        section: 'SANDWICHES',
        items: [
          {
            item: 'Grick Middle',
            description: 'Fried Egg, Bacon, Rosemary Aioli, Smoked Cheddah, Tomato Jam, Arugula',
            price: '$9.50',
          },
          {
            item: 'Chef Beef',
            description: 'Roast Beef, Horseradish Aioli, Pickled Red Onions, Rip-L Chips, Arugula',
            price: '$12.50',
          },
          {
            item: "It's Always Sunny In Ritchiedelphia",
            description: 'Donair Meat, Cheez Sauce, Pickled Jalapeños, Chipotle Sauce, Sautéed Peppers & Onions, Arugula',
            price: '$14.50',
          },
          {
            item: 'Large Marge',
            description: 'Vegan Sliced "beef", Big Mac Sauce, Crispy Onions, Shredded Cheddar, Pickles, Diced Onion, Greens',
            price: '$13.50',
            tags: ['Vegan'],
          },
        ],
      },
      {
        section: 'PASTRIES',
        items: [
          { item: 'Cherry Lime Cronuts', price: '$4.50' },
          { item: 'Plain Cinnamon Sugar Cronuts', price: '$4' },
          { item: 'Mini Egg Donuts', price: '$4' },
          { item: 'Vanilla Sprinkle Donuts', price: '$3.25' },
          { item: 'Chocolate Chip Cookies', price: '$3' },
        ],
      },
    ],
  },
];

const SUNTERRA_DEPARTMENTS: PartnerMenu[] = [
  {
    label: 'DEPARTMENTS',
    sections: [
      {
        section: 'BAKERY',
        items: [
          { item: 'Tortillas, Pitas & Bagels' },
          { item: 'Bread & Loaves' },
          { item: 'Desserts & Pastries' },
        ],
      },
      {
        section: 'KITCHEN PREPARED',
        items: [
          { item: 'Meals & Mains' },
          { item: 'Sides, Soups & Salads' },
          { item: 'Fresh Pasta, Sauces & Dips' },
          { item: 'Feasts & Meal Kits' },
        ],
      },
      {
        section: 'DELI MEAT AND CHEESE',
        items: [
          { item: 'Specialty Cheese & Charcuterie' },
          { item: 'Cured & Smoked Meat, Sausages, Bacon' },
          { item: 'Packaged Cheese' },
        ],
      },
      {
        section: 'FRESH MEAT',
        items: [
          { item: 'Beef' },
          { item: 'Poultry' },
          { item: 'Seafood' },
          { item: 'Pork, Lamb, Bison, Veal' },
        ],
      },
      {
        section: 'PRODUCE',
        items: [
          { item: 'Fruit & Vegetables' },
          { item: 'Herbs, Prepared & Dried Produce, Bulk Nuts' },
          { item: 'Fresh Juices & Smoothies' },
          { item: 'Floral' },
        ],
      },
      {
        section: 'DAIRY',
        items: [
          { item: 'Milk, Cream & Dairy Alternatives' },
          { item: 'Yogurt, Fresh Dips, Whipped & Sour Creams' },
          { item: 'Butter & Margarine' },
          { item: 'Eggs' },
          { item: 'Chilled Juice' },
        ],
      },
      {
        section: 'GROCERY',
        items: [
          { item: 'Cooking & Baking' },
          { item: 'International' },
          { item: 'Breakfast' },
          { item: 'Coffee, Tea, Hot Chocolate & Dry Beverage' },
          { item: 'Condiments' },
          { item: 'Cookies, Chocolate, Sweets & Gum' },
          { item: 'Crackers, Chips & More Snacks' },
          { item: 'Noodles, Pastas & Pasta Sauce' },
          { item: 'Salad Dressing & Toppers' },
          { item: 'Sauces, Marinades & Meat Preparations' },
          { item: 'Beverages' },
          { item: 'Oil & Vinegar' },
          { item: 'Soup' },
          { item: 'Canned & Preserved Goods' },
          { item: 'Spreads & Syrup' },
          { item: 'Refrigerated Grocery' },
          { item: 'Gift Baskets' },
        ],
      },
      {
        section: 'FROZEN FOOD',
        items: [
          { item: 'Entrees, Appetizers & Sides' },
          { item: 'Desserts' },
          { item: 'Frozen Pastries & Baking Supplies' },
          { item: 'Frozen Produce, Juice & Beverage Mixes' },
          { item: 'Ice' },
        ],
      },
      {
        section: 'HOUSEHOLD AND HEALTH',
        items: [
          { item: 'Cleaning & Home' },
          { item: 'Personal Care, Health & Hygiene' },
          { item: 'Food Storage, Wrap, Foil & Bags' },
          { item: 'Disposables, Tissue & Paper Towels' },
        ],
      },
      {
        section: 'GENERAL MERCHANDISE',
        items: [
          { item: 'Lightbulbs, Batteries & Other Supplies' },
          { item: 'Magazines & Newspapers' },
        ],
      },
    ],
  },
];

export const PARTNER_MENUS: Record<string, PartnerMenu[]> = {
  'Rosewood Foods': [
    {
      label: 'WEEKDAYS',
      sections: [
        {
          section: 'ALL-DAY',
          items: [
            {
              item: 'Pecan-Coconut Granola',
              description: 'Housemade granola with pecans, organic yogurt, seasonal fresh fruit, house strawberry preserves',
              price: '$13',
              tags: ['Vegetarian'],
            },
            {
              item: 'Verde Rice',
              description: 'Salsa verde toasted calrose rice, cherry tomato, persian cucumber, shaved radish, pickled carrot, za\'atar, house chili oil',
              price: '$17',
              tags: ['Gluten free', 'Vegan'],
              addOns: [
                { item: 'Sunny farm egg', price: '$2.50' },
                { item: 'Hickory bacon', price: '$6.50' },
                { item: 'House chicken sausage', price: '$6.50' },
              ],
            },
            {
              item: 'Breakfast Sandwich',
              description: 'Four Whistle Farm egg, cheddar & chili jam on house milk bun.',
              addOns: [
                { item: 'Griddled Scallion', price: '$11' },
                { item: 'Hickory Bacon', price: '$12' },
                { item: 'House Chicken Sausage', price: '$12' },
              ],
            },
            {
              item: 'Lox & Egg Sandwich',
              description: 'Pastrami-spice cured salmon, caramelized onion, scrambled farm egg, dressed kale, house milk bun',
              price: '$16',
            },
            {
              item: 'Chèvre Grilled Cheese',
              description: 'Whipped goat cheese, aged white cheddar, caramelized onion, house milk bread. Add Crispy Potatoes (+5).',
              price: '$13',
              tags: ['Vegetarian'],
            },
            {
              item: 'Breakfast Bowl',
              description: '2 creamy scrambled farm eggs, aged white cheddar, charred tomato salsa, chili jam on crispy potatoes and choice of: Mushroom, Bacon, or Chicken Sausage.',
              price: '$21',
            },
            {
              item: 'Breakfast Rice',
              description: 'Toasted caramelized miso rice, with sauteed seasonal veggies, served with a sunny farm egg.',
              price: '$19',
              tags: ['Gluten free', 'Vegetarian'],
            },
          ],
        },
        {
          section: 'SALADS',
          note: 'After 11 am',
          items: [
            {
              item: 'Kale Gomadare Salad',
              description: 'Local persian cucumber, cherry tomato, shaved radish, tangy Japanese-style sesame dressing',
              price: '$17',
              tags: ['Gluten free', 'Vegan'],
              addOns: [{ item: 'Katsu Chicken Cutlet', price: '$7.50' }],
            },
            {
              item: 'Fennel-Orange Salad',
              description: 'Radicchio, endive, fresh orange, fennel, castelvetrano olives, orange-dijon vinaigrette',
              price: '$18',
              tags: ['Gluten free', 'Vegan'],
              addOns: [{ item: 'Katsu Chicken Cutlet', price: '$7.50' }],
            },
            {
              item: 'Bistro Chicken Salad',
              description: 'Our take on a hearty Caesar salad! Endive, radicchio, roasted broccoli, crispy potatoes w. lemony grilled chicken thigh & anchovy vinaigrette.',
              price: '$23',
              tags: ['Gluten free'],
            },
          ],
        },
        {
          section: 'SANDWICHES',
          note: 'After 11 am · served w. crispy potatoes or kale gomadare salad (+2)',
          items: [
            {
              item: 'Lemon-Roasted Broccoli Sandwich',
              description: 'Roasted leek, shaved radish & spicy cashew sauce on house focaccia',
              price: '$19',
              tags: ['Vegan'],
            },
            {
              item: 'Katsu Chicken Sandwich',
              description: 'Japanese-style fried chicken, tangy red cabbage, housemade kewpie mayo, katsu sauce, milk bun',
              price: '$22',
            },
            {
              item: 'Rosewood Bar Burger',
              description: 'House-ground angus beef, cheddar, pickled white onion, mustard, house ketchup on milk bun',
              price: '$19',
            },
            {
              item: 'French Patty Melt',
              description: 'Herbes de provence mushroom ragu, angus beef patty, aged white cheddar, house dijonnaise, milk bun',
              price: '$22',
            },
            {
              item: 'Rosewood Club Sandwich',
              description: 'Lemon-grilled chicken thigh, hickory bacon, cheddar, dressed bitter greens, charred tomato salsa, house mayo, milk bun',
              price: '$22',
            },
          ],
        },
      ],
    },
    {
      label: 'WEEKEND',
      sections: [
        {
          section: 'ALL-DAY BRUNCH',
          items: [
            {
              item: 'Pecan-Coconut Granola',
              description: 'Housemade granola with pecans, organic yogurt, seasonal fresh fruit, house strawberry preserves',
              price: '$13',
              tags: ['Vegetarian'],
            },
            {
              item: 'Lemony Buttermilk Pancakes',
              description: '3 fluffy, zesty pancakes w. Gosford Farm (QC) maple syrup, pat of butter',
              price: '$17',
              tags: ['Vegetarian'],
              addOns: [
                { item: 'Sunny farm egg', price: '$2.50' },
                { item: 'Hickory bacon', price: '$6.50' },
                { item: 'House chicken sausage', price: '$6.50' },
              ],
            },
            {
              item: 'Breakfast Sandwich',
              description: 'Four Whistle Farm egg, cheddar & chili jam on house milk bun. Served w. Crispy Potatoes.',
              addOns: [
                { item: 'Griddled Scallion', price: '$17' },
                { item: 'Hickory Bacon', price: '$18' },
                { item: 'House Chicken Sausage', price: '$18' },
              ],
            },
            {
              item: 'Lox & Egg Sandwich',
              description: 'Pastrami-spice cured salmon, caramelized onion, scrambled farm egg, dressed kale, milk bun. Served w. Crispy Potatoes.',
              price: '$22',
            },
            {
              item: 'Breakfast Burrito',
              description: 'House chicken sausage, 2 creamy scrambled farm eggs, white cheddar, cherry tomato-herb salsa & chili. Served w. Crispy Potatoes. Also available vegetarian.',
              price: '$21',
            },
            {
              item: 'Breakfast Bowl',
              description: '2 creamy scrambled farm eggs, aged white cheddar, charred tomato salsa, chili jam on crispy potatoes and choice of: Mushroom, Bacon, or Chicken Sausage.',
              price: '$21',
            },
            {
              item: 'Verde Rice',
              description: 'Salsa verde toasted calrose rice, cherry tomato, persian cucumber, shaved radish, pickled carrot, za\'atar, house chili oil',
              price: '$17',
              tags: ['Gluten free', 'Vegan'],
              addOns: [
                { item: 'Sunny farm egg', price: '$2.50' },
                { item: 'Hickory bacon', price: '$6.50' },
                { item: 'House chicken sausage', price: '$6.50' },
              ],
            },
          ],
        },
        {
          section: 'SALADS',
          items: [
            {
              item: 'Kale Gomadare Salad',
              description: 'Local persian cucumber, cherry tomato, shaved radish, tangy Japanese-style sesame dressing',
              price: '$17',
              tags: ['Gluten free', 'Vegan'],
              addOns: [{ item: 'Katsu Chicken Cutlet', price: '$7.50' }],
            },
          ],
        },
        {
          section: 'SANDWICHES',
          note: 'Served w. crispy potatoes or kale gomadare salad (+2)',
          items: [
            {
              item: 'Lemon-Roasted Broccoli Sandwich',
              description: 'Roasted leek, shaved radish & spicy cashew sauce on house focaccia',
              price: '$19',
              tags: ['Vegan'],
            },
            {
              item: 'Katsu Chicken Sandwich',
              description: 'Japanese-style fried chicken, tangy red cabbage, housemade kewpie mayo, katsu sauce, milk bun',
              price: '$22',
            },
            {
              item: 'Rosewood Bar Burger',
              description: 'House-ground angus beef, cheddar, pickled white onion, mustard, house ketchup on milk bun',
              price: '$19',
            },
            {
              item: 'French Patty Melt',
              description: 'Herbes de provence mushroom ragu, angus beef patty, aged white cheddar, house dijonnaise, milk bun',
              price: '$22',
            },
          ],
        },
      ],
    },
    {
      label: 'DRINKS',
      sections: [
        {
          section: 'BRUNCH COCKTAILS',
          items: [
            { item: 'Mimosa', price: '$12' },
            { item: 'Peach Bellini', price: '$12' },
            { item: 'Bourbon Peach Iced Tea', price: '$14' },
            { item: 'Aperol Spritz', price: '$14' },
            { item: 'Breakfast Beer', description: 'Kölsch + Grapefruit', price: '$10' },
          ],
        },
        {
          section: 'WINE',
          note: 'Natural/organic',
          items: [
            { item: 'Biutiful Cava Brut Nature', price: '$12' },
            { item: 'Salvard Cheverny', price: '$14' },
            { item: 'St. John Beausoleil Rosé', price: '$15' },
            { item: 'Parajes del Valle Monastrell' },
          ],
        },
      ],
    },
  ],

  'rosso pizzeria': [
    {
      label: 'BREAKFAST',
      sections: [
        {
          section: 'BREAKFAST PANINI',
          note: 'Add Cup: Granola or Coppa Di Frutta +$4',
          items: [
            {
              item: 'Vegetarian Breakfast',
              description: 'Two scrambled eggs, smoked mozzarella, gruyère, roasted spinach, avocado, roasted peppers & zucchini',
              price: '$15',
              tags: ['Vegetarian'],
            },
            {
              item: 'Bacon & Cheese',
              description: 'Two over easy local free run eggs, arugula, smoked bacon, old cheddar, house-made fig, garlic & onion chutney',
              price: '$16',
            },
          ],
        },
        {
          section: 'TOAST',
          note: 'Add Cup: Chickpea, Beet & Grain, Arugula, Kale Caesar, Soup, Granola or Berries +$4',
          items: [
            { item: 'Mascarpone & Berries', description: 'Mascarpone cheese, mixed berries, honey and mint', price: '$8' },
            { item: 'Salmon', description: 'Smoked salmon, dill cream cheese, lemon, pickled red onions, sliced boiled egg, capers', price: '$10' },
            { item: 'Avocado', description: 'Avocado, Brie cheese, chopped tomatoes, one local free run scrambled egg', price: '$9', tags: ['Vegetarian'] },
            { item: 'Bacon', price: '$4' },
            { item: 'Tuna', description: 'Tuna, avocado, arugula, aioli dressing, chili flakes', price: '$9' },
            { item: 'Brie and Jam', description: 'House-made fig jam, spinach, and Brie cheese', price: '$8', tags: ['Vegetarian'] },
            { item: 'Fior e Crudo', description: 'Fior di latte mozzarella, smoked prosciutto, roasted tomato, balsamic glaze', price: '$9' },
            { item: 'Grilled Apple', description: 'Grilled apple slices, local honey, house-made ricotta and walnut', price: '$8', tags: ['Vegetarian'] },
          ],
        },
        {
          section: 'BOWLS & EGGS',
          items: [
            { item: 'Granola', description: 'House-made small batch granola with whole milk, almond, soy, or oat milk', price: '$8' },
            { item: 'Granola with Organic Yogurt', price: '$10' },
            { item: 'Scramble', description: 'Two scrambled eggs, roasted potatoes, peppers, red onions, tomato, smoked mozzarella, house-made spicy salsa', price: '$17', addOns: [{ item: 'Hot or fennel Italian sausage or smoked bacon', price: '+$3' }] },
            { item: 'Coppa di Frutta', description: 'Organic berries with house-made granola, local honey, house-made ricotta or organic plain yogurt and mint', price: '$15' },
          ],
        },
        {
          section: 'PIZZA',
          note: 'Wood-fired',
          items: [
            { item: 'Funghi dal Bosco', description: 'Roasted mixed mushrooms, fior di latte, Taleggio, roasted garlic, parsley, white truffle oil, over easy egg', price: '$26' },
            { item: 'Canadese', description: 'Sliced Yukon Gold potatoes, pancetta, fior di latte, rosemary oil, over easy egg', price: '$26' },
            { item: 'Calabrese', description: 'Italian broccoli, roasted garlic, fior di latte, Taleggio, house-made fennel sausage, chili flakes, over easy egg', price: '$26' },
          ],
        },
        {
          section: 'PLATES & SKILLETS',
          note: 'All egg dishes prepared in the wood-fired oven',
          items: [
            {
              item: 'Frittata',
              description: 'Build your own. Three local free run eggs with mixed grilled vegetables or roasted potatoes. Protein +$2 ea · Veggies +$1 ea · Cheese +$2 ea',
              price: '$11',
            },
            { item: 'Lobster and Crab Eggs Benedict', description: 'Two local free run eggs, lobster, crab, house-made hollandaise, tomato bruschetta on brioche. Choice of grilled vegetables or roasted potatoes', price: '$23' },
            { item: 'Italian Farmers\' Breakfast', description: 'Two local free run eggs, roasted potatoes or veggies, choice of Italian sausage, smoked bacon, or 4oz beef tenderloin, house-made organic bread', price: '$17' },
            { item: 'Vegetarian Benedict', description: 'Two local free run eggs, hollandaise, spinach, avocado and tomato on focaccia. Choice of berries or roasted potatoes', price: '$17', tags: ['Vegetarian'] },
            { item: 'Soppressata Eggs Benedict', description: 'Two local free run eggs, chipotle hollandaise, soppressata, arugula on focaccia. Choice of grilled vegetables or roasted potatoes', price: '$18' },
            { item: 'Bacon & Old Cheddar Eggs Benedict', description: 'Two local free run eggs, hollandaise, smoked bacon and old cheddar on focaccia. Choice of grilled vegetables or roasted potatoes', price: '$18' },
            { item: 'Verdure e Grano', description: 'Two poached local free run eggs on sautéed spinach, roasted butternut squash, barley, quinoa, sautéed onion and roasted garlic. Chipotle hollandaise', price: '$17' },
            { item: 'French Toast', description: 'Bread in creamy vanilla sauce, filled with mascarpone, cinnamon, topped with organic berries and icing sugar', price: '$17' },
            { item: 'Verdure Miste Skillet', description: 'Fire roasted sweet potatoes, zucchini, spinach, onion, red peppers, avocado, chipotle hollandaise, two eggs, fresh tomato. Cast iron skillet with house-made bread', price: '$17', tags: ['Vegetarian'] },
            { item: 'Amore Carne Skillet', description: 'Fire roasted potatoes, fennel sausage, spicy sausage, bacon, soppresata, mushrooms, onion, two eggs, hollandaise, pasta sauce, crispy prosciutto. With house-made bread', price: '$18' },
            { item: 'Salmon Eggs Benedict', description: 'Two local free run eggs, dill & caper hollandaise, smoked salmon on English muffin. Choice of grilled vegetables or roasted potatoes', price: '$19' },
            { item: 'Calabrese Sausage Benedict', description: 'Two local free run eggs, hollandaise, spicy Italian sausage, provolone, arugula on brioche. Choice of grilled vegetables or roasted potatoes', price: '$18' },
          ],
        },
        {
          section: 'DOLCE',
          note: 'All desserts and gelato are house-made',
          items: [
            { item: 'Fonduta di Cioccolato', description: 'Chocolate cake and creamy ganache, topped with gelato of your choice', price: '$12' },
            { item: 'Panna Cotta', description: 'Cream, gelatin, and vanilla, topped with espresso chocolate mousse and berries', price: '$12' },
            { item: 'Caffè Affogato', description: 'Small / Large', price: '$6.50 / $8.50' },
            { item: 'Crumble di Mele', description: 'Fire roasted granny smith apples, cinnamon, caramel, oats, pecans, walnuts, topped with gelato of your choice', price: '$12' },
            { item: 'Tiramisu', description: 'An authentic Venetian recipe', price: '$12' },
            { item: 'Gelato', description: 'Small / Large', price: '$4.95 / $6.50' },
          ],
        },
      ],
    },
    {
      label: 'LUNCH',
      sections: [
        {
          section: 'ZUPPA',
          items: [
            { item: 'Roasted Red Pepper & Tomato', description: 'House-made soup, topped with house-made croutons and feta', price: '$6.50 / $10' },
            { item: 'Zuppa Del Giorno', description: 'House-made soup of the day; ask your server', price: '$6.50 / $10' },
          ],
        },
        {
          section: 'INSALATE',
          note: 'Add: Local Organic Chicken +$4',
          items: [
            { item: 'Granelle di Jess', description: 'Red beets, barley, quinoa, hemp seeds, cilantro, edamame, goat cheese, candied pistachios, on lightly dressed arugula', price: '$18' },
            { item: 'Arugula e Grana', description: 'Organic arugula, Amorosa tomatoes, parmigiano Reggiano, olive oil and juiced lemon', price: '$13 / $10', addOns: [{ item: 'Prosciutto crudo or beef bresaola', price: '+$4' }] },
            { item: 'Avocado e Gamberi', description: 'Blackened shrimp, feta cheese, Amorosa tomatoes, pickled red onion, arugula and kale in cilantro lime dressing', price: '$20' },
            { item: 'Kale Caesar', description: 'Kale, house-made croutons, crispy capers, parmigiano Reggiano, house-made caesar dressing', price: '$17 / $12' },
            { item: 'Beet & Grain Bowl', description: 'Red beets, barley, quinoa, hemp seeds, cilantro, edamame and feta, with white balsamic vinaigrette', price: '$13' },
            { item: 'Insalata di Raccolto', description: 'Organic spring mix, spinach, hemp hearts, butternut squash, pears, cranberries, pickled red onion, feta, parsley, walnuts and rosemary maple dressing', price: '$18' },
            { item: 'Mele alla Griglia', description: 'Organic spring mix, shredded brussels sprouts, grilled apple, local goat cheese, pine nuts, sesame seeds and apple cider vinaigrette', price: '$18' },
            { item: 'Caprese', description: 'Amorosa tomatoes, mozzarella fior di latte, fresh basil, coarse salt and olive oil', price: '$16' },
            { item: 'Asparagi e Patate', description: 'Fire roasted asparagus, kale and potatoes with dijon grainy mustard and white balsamic dressing, topped with a med-boiled egg, parmigiano Reggiano and truffle oil', price: '$17' },
            { item: 'Suprema', description: 'Organic spring mix, hard boiled eggs, bacon, blackened chicken, feta, avocado, tomato, cucumber, pickled onion with mango honey dressing', price: '$20' },
          ],
        },
        {
          section: 'PASTA',
          note: 'Hand-made pasta noodles at our sister restaurant Bianco',
          items: [
            { item: 'Rigatoni', description: 'House-made rigatoni in pomodoro sauce', price: '$24', addOns: [{ item: 'Organic beef tenderloin meatballs', price: '+$3 ea' }, { item: 'Spicy sausage', price: '+$3 ea' }] },
            { item: 'Weekly Feature', description: 'Rotating feature pasta — ask your server for details', price: 'Ask server' },
          ],
        },
        {
          section: 'PANINI',
          note: 'Napolitani sandwich on house-made organic bread. Limited quantity available',
          items: [
            { item: 'Vegetariano', description: 'Avocado, tomato, cucumber, pickled onion, goat cheese, oregano, olive oil, with lightly dressed arugula', price: '$14 / $8', tags: ['Vegetarian'] },
            { item: 'Italiano', description: 'Olive oil, veggie spread, oregano, hot capicola, soppressata, beef salami, and Provolone', price: '$16 / $10' },
            { item: 'Pollo di Caesar', description: 'Blackened chicken, avocado, kale, Parmigiano, house-made caesar dressing', price: '$18 / $11' },
            { item: 'Pollo e Pesto', description: 'Local organic marinated chicken, provolone cheese, fresh tomato, arugula with house-made pesto', price: '$18 / $11' },
            { item: 'Panino Classico', description: 'Prosciutto crudo, burrata cheese, onion tomato chutney, oregano and olive oil', price: '$18 / $11' },
          ],
        },
        {
          section: 'PIZZA ROSSA',
          note: 'We use unbleached, non-GMO, \'00\', organic flour for our pizza dough',
          items: [
            { item: 'Margherita', description: 'San Marzano tomato sauce, mozzarella fior di latte, Pecorino Romano and fresh basil', price: '$16 / $12' },
            { item: 'Ortolona', description: 'San Marzano tomato sauce, mozzarella fior di latte, local goat cheese, sweet roasted peppers, basil, artichoke, mixed mushrooms and kalamata olives', price: '$24 / $15' },
            { item: 'Burrata di Simona', description: 'San Marzano tomato sauce, Pecorino Romano, topped with fresh burrata, fresh basil and olive oil', price: '$25 / $15' },
            { item: 'Rosso', description: 'San Marzano tomato sauce, mozzarella fior di latte, taleggio, soppressata, local homemade Italian hot sausage, seasonal hot peppers and chili oil', price: '$28 / $17' },
            { item: 'Kale Saltati', description: 'San Marzano tomato sauce, mozzarella fior di latte, kale, roasted garlic and onions, mixed mushrooms, artichoke and house-made ricotta', price: '$24 / $15' },
            { item: 'Prosciutto Cotto', description: 'San Marzano tomato sauce, mozzarella fior di latte, prosciutto cotto and roasted mixed mushrooms', price: '$26.50 / $17' },
            { item: 'Salsiccia', description: 'San Marzano tomato sauce, mozzarella fior di latte, local organic fennel sausage, robiola cheese, caramelized onion, roasted peppers', price: '$27 / $17' },
            { item: 'Soppressata', description: 'San Marzano tomato sauce, mozzarella fior di latte, spicy soppressata and oregano', price: '$27 / $17' },
            { item: 'Mama Mia', description: 'San Marzano tomato sauce, mozzarella fior di latte, honey chèvre goat cheese, asiago, sweet gorgonzola, roasted garlic and fresh basil', price: '$24 / $15' },
            { item: 'Di Mama', description: 'San Marzano tomato sauce, mozzarella fior di latte, roasted mixed mushrooms, kalamata olives, oregano and basil', price: '$24.50 / $15' },
          ],
        },
        {
          section: 'PIZZA BIANCA',
          note: 'We use unbleached, non-GMO, \'00\', organic flour for our pizza dough',
          items: [
            { item: 'Filetto di Manzo', description: 'Local organic beef tenderloin, mozzarella fior di latte, taleggio, roasted tomato, roasted garlic, hot peppers, pickled onion, pesto sauce and olive oil', price: '$29 / $18' },
            { item: 'Pizza Rucola', description: 'Organic arugula, mozzarella fior di latte, parmigiano Reggiano and Amorosa tomatoes', price: '$23.50 / $13.50', addOns: [{ item: 'Prosciutto crudo or beef bresaola', price: '+$4' }, { item: 'Avocado', price: '+$2' }] },
            { item: 'Pera e Prosciutto', description: 'Pear, mozzarella fior di latte, Gorgonzola, smoked prosciutto, toasted pecans and honey', price: '$28 / $17' },
            { item: 'Pollo Tropicale', description: 'Blackened organic chicken, pineapple, mozzarella fior di latte, roasted garlic, caramelized onion and cilantro', price: '$28 / $17' },
            { item: 'Mare di Benjamino', description: 'Lobster, crab, marinated tiger prawns, mozzarella fior di latte, caramelized onion, roasted tomato, lemon butter, and parsley', price: '$29 / $18' },
            { item: 'Funghi Misti', description: 'Roasted mixed mushrooms, mozzarella fior di latte, taleggio, roasted garlic, and fresh parsley with white truffle oil', price: '$26 / $16.50' },
            { item: 'Rapini e Salsiccia', description: 'Italian broccoli, mozzarella fior di latte, local homemade organic fennel sausage, caramelized onion, roasted garlic, local goat cheese and lemon zest', price: '$27 / $17' },
            { item: 'Uva e Pancetta', description: 'Fire roasted grapes, caramelized onion, smoked pancetta, rosemary, house-made ricotta, gruyère, smoked mozzarella, toasted pine nuts, local honey and olive oil', price: '$26 / $16.50' },
            { item: 'Dolce Emma', description: 'Smoked pancetta and bacon, mozzarella fior di latte, roasted garlic, maple syrup, topped with fresh house-made ricotta and crispy prosciutto crudo', price: '$27 / $17' },
            { item: 'Avocado di Pollo', description: 'Local organic chicken, avocado, smoked mozzarella, fior di latte, roasted garlic, topped with fresh arugula, chopped tomatoes, chili flakes and parmigiano Reggiano', price: '$28 / $17' },
            { item: 'Salame di Manzo', description: 'Beef salami, mozzarella fior di latte, artichokes, mixed mushrooms, truffle oil and parmigiano Reggiano', price: '$27 / $17' },
            { item: 'Dolce e Piccante', description: 'Sweet potato cream, spicy soppressata, mozzarella fior di latte, house-made ricotta, caramelized onion, topped with crispy prosciutto and honey', price: '$27 / $17' },
            { item: 'La Pizza Campania', description: 'Roasted mixed mushrooms, mozzarella fior di latte, taleggio, roasted garlic, artichokes, spicy soppressata, caramelized onion, parsley, and truffle oil', price: '$27 / $17' },
          ],
        },
        {
          section: 'DOLCE',
          note: 'All desserts and gelato are house-made',
          items: [
            { item: 'Fonduta di Cioccolato', description: 'Chocolate cake and creamy ganache, topped with gelato of your choice', price: '$12' },
            { item: 'Panna Cotta', description: 'Cream, gelatin, and vanilla, topped with espresso chocolate mousse and berries', price: '$12' },
            { item: 'Caffè Affogato', description: 'Small / Large', price: '$6.50 / $8.50' },
            { item: 'Crumble di Mele', description: 'Fire roasted granny smith apples, cinnamon, caramel, oats, pecans, walnuts, topped with gelato of your choice', price: '$12' },
            { item: 'Tiramisu', description: 'An authentic Venetian recipe', price: '$12' },
            { item: 'Gelato', description: 'Small / Large', price: '$4.95 / $6.50' },
          ],
        },
      ],
    },
    {
      label: 'DRINKS',
      sections: [
        {
          section: 'VINO BIANCO & ROSÉ',
          note: '4oz · 8oz · Bottle',
          items: [
            { item: 'Wente Chardonnay', description: 'USA', price: '$9.50 · $18 · $55' },
            { item: 'Dal Cero Ramato Pinot Grigio', description: 'Italy (Ramato)', price: '$9.50 · $18 · $55' },
            { item: 'Ant Moore Sauvignon Blanc', description: 'New Zealand', price: '$9.50 · $18 · $55' },
            { item: 'Chiusa Grande Rosé', description: 'Italy', price: '$9.50 · $18.50 · $55' },
            { item: 'Banfi San Angelo Pinot Grigio', description: 'Italy', price: '$56' },
            { item: 'François Chidaine Sauvignon Blanc', description: 'Touraine, France', price: '$65' },
            { item: 'Sandro de Bruno Pinot Grigio', description: 'Italy (Ramato)', price: '$55' },
            { item: 'Nett Tracken Gewürztraminer', description: 'Germany', price: '$60' },
            { item: 'Casa De Santar Branco', description: 'Portugal', price: '$58' },
            { item: 'Bindi Sergardi Bindo Bianco', description: 'Italy', price: '$58' },
          ],
        },
        {
          section: 'VINO ROSSO',
          note: '4oz · 8oz · Bottle',
          items: [
            { item: 'La Posta Malbec/Syrah', description: 'Argentina', price: '$9 · $17 · $51' },
            { item: 'Grayson Cellars Cabernet Sauvignon', description: 'California', price: '$9.50 · $19.50 · $58' },
            { item: 'Visconti Montalcino Rosso di Montalcino', description: 'Tuscany', price: '$11.50 · $22.50 · $67' },
            { item: 'Coto De Imaz Tempranillo Reserve', description: 'Spain', price: '$9.50 · $18.50 · $55' },
            { item: 'Ricardelle Pinot Noir', description: 'France', price: '$56' },
            { item: 'Le Pupille Sangiovese', description: 'Italy', price: '$56' },
            { item: 'Terra D\'Alter Reserva Blend', description: 'Portugal', price: '$60' },
            { item: 'Falasco Ferus Single Vineyard Malbec', description: 'Argentina', price: '$70' },
            { item: 'Speri Ripasso Valpolicella Classico Superiore', description: 'Italy', price: '$70' },
            { item: 'Feudo Montoni Nero d\'Avola', description: 'Italy', price: '$74' },
            { item: 'Grounded Wine Co. Cabernet Sauvignon', description: 'United States', price: '$75' },
            { item: 'Bruno Giacosa Barbera d\'Alba', description: 'Italy', price: '$85' },
            { item: 'Pasetti Testarossa Montepulciano', description: 'Italy', price: '$85' },
            { item: 'Fanti Brunello di Montalcino', description: 'Italy', price: '$110' },
            { item: 'Le Ragose Amarone', description: 'Italy', price: '$115' },
          ],
        },
        {
          section: 'BUBBLES',
          note: '4oz · 8oz · Bottle',
          items: [
            { item: 'Canella Prosecco Superiore', description: 'Italy', price: '$9.50 · $18.50 · $55' },
            { item: 'Lini 910 Lambrusco Rosso', description: 'Sparkling red, Italy', price: '$9.50 · $18.50 · $55' },
            { item: 'Ca\'Del Baio Moscato', description: 'Italy', price: '$55' },
          ],
        },
        {
          section: 'BIRRA',
          note: 'Bottle / Can',
          items: [
            { item: 'Erdinger Dunkel', description: 'Dunkelweizen, 500ml, 5.6% · Germany', price: '$10' },
            { item: 'Erdinger Weissbier', description: 'Hefeweizen, 500ml, 5.3% · Germany', price: '$9.50' },
            { item: 'Pilsner Urquell', description: 'Pilsner, 355ml, 4.4% · Czech Republic', price: '$8' },
            { item: 'Driftwood Fat Tug IPA', description: '473ml, 7% · BC', price: '$9' },
            { item: 'Birra Moretti', description: 'Pale lager, 330ml, 4.6% · Italy', price: '$8' },
            { item: 'Modelo Especial', description: 'Lager, 355ml, 4.5% · Mexico', price: '$8' },
            { item: 'Rochefort 10', description: 'Abbey quad, 330ml, 11.3% · Belgium', price: '$12.50' },
            { item: 'Chimay Red', description: 'Abbey dubbel, 330ml, 7% · Belgium', price: '$10.50' },
            { item: 'Guinness', description: 'Dry stout, 440ml, 4.2% · Ireland', price: '$7.50' },
            { item: 'Glutenberg Pale Ale', description: 'Gluten free, 473ml, 5% · Québec', tags: ['GF'], price: '$9' },
          ],
        },
        {
          section: 'BEVERAGES',
          items: [
            { item: 'San Pellegrino', description: '750ml / 250ml', price: '$9 / $4' },
            { item: 'Fruit Nectar', description: 'Peach or pear', price: '$4' },
            { item: 'Italian Soda', description: 'Pineapple, pear, passionfruit, kiwi, or strawberry', price: '$4' },
            { item: 'Italian Iced Tea', description: 'Lemon or peach', price: '$4' },
            { item: 'San Pellegrino Sparkling', description: 'Blood orange, lemon, or orange', price: '$4' },
            { item: 'Orangina', price: '$4' },
            { item: 'Chinotto', price: '$4' },
            { item: 'Fentimans Cola', description: 'Curiosity Cola', price: '$4' },
            { item: 'Diet Coke', price: '$4' },
            { item: 'Unlimited Sparkling on Tap', price: '$2.75' },
          ],
        },
        {
          section: 'CAFFÈ',
          note: '3% milk, soy, almond, or oat milk available',
          items: [
            { item: 'Espresso', price: '$2.50' },
            { item: 'Macchiato', price: '$3' },
            { item: 'Doppio', price: '$3' },
            { item: 'Caffè con Panna', price: '$3' },
            { item: 'Americano', price: '$3.50' },
            { item: 'Caffè Cortado', price: '$4.50' },
            { item: 'Cappuccino', price: '$4.50' },
            { item: 'Caffè Latte', price: '$5' },
            { item: 'Vanilla Caffè Latte', price: '$6' },
            { item: 'Hot Chocolate', price: '$5.50' },
            { item: 'Caffè Mocha', price: '$5.50' },
            { item: 'Remedy Dirty Chai', price: '$6.50' },
            { item: 'Assorted Organic Teas', price: '$3' },
            { item: 'Caffè Canadese', description: 'Strong and bold', price: '$4' },
            { item: 'Caffè Corretto', price: '$4' },
          ],
        },
      ],
    },
  ],

  'olia': [
    {
      label: 'MENU',
      sections: [
        {
          section: 'ANTIPASTI',
          items: [
            { item: 'Olives', description: 'Nocellara del Belice & bella cerignola', price: '$12' },
            { item: 'Arancini', description: 'Leek, truffle, whey, asiago fresco, parmigiano reggiano 2pc', price: '$16' },
            { item: 'Whipped Goat Ricotta', description: 'Rosemary oil, maldon sea salt, fettunta 2pc', price: '$16' },
            { item: 'Culatello', description: 'Thinly sliced cured pork from Parma, saba & parmigiano', price: '$24' },
            { item: 'Beef Tartare Piemontese', description: 'Pickled celery root, truffle, parmigiano & rye crackers', price: '$29' },
            { item: 'Insalata Toscana', description: 'Black kale, chickpeas, shallot, crispy farro & ricotta salata', price: '$24' },
            { item: 'Charred Cabbage', description: 'Ligurian walnut pesto, lemon & parmigiano', price: '$23' },
          ],
        },
        {
          section: 'PRIMI',
          items: [
            { item: 'Gnocchi Pomodoro', description: 'Confit Gull Valley tomatoes, basil, parmigiano vacche rosse, Ligurian olive oil', price: '$36' },
            { item: 'Crab & Potato Raviolini', description: 'Pink prawns, saffron butter, chili, pangrattato, fennel', price: '$37' },
            { item: 'Chestnut Agnolotti', description: 'Brussels sprouts, brown butter, balsamico vecchio & parmigiano', price: '$39' },
            { item: 'Cappellacci', description: 'Parsnip, beef ragu, beech mushrooms & parmigiano crema', price: '$39' },
            { item: 'Fiorentini Verde', description: 'Braised lamb ragu bianco, parsley, lemon & pecorino canestrato', price: '$39' },
          ],
        },
        {
          section: 'SECONDI',
          items: [
            { item: 'Game Hen "Treviso"', description: 'Radicchio, saba, prosciutto, roasted grapes & foie gras crostino', price: '$48' },
            { item: 'Brodetto di Pesce', description: 'Sable fish, pink prawns, hokkaido scallops & clams', price: '$52' },
            { item: 'Whey Braised Pork', description: 'Irvings farm pork, polenta, brussels sprouts & pickled mustard seed', price: '$46' },
            { item: 'Bistecca', description: '2" thick T-bone, anchovy butter, roasted mushrooms', price: 'MP' },
            { item: 'Olive Oil Confit Potatoes', price: '$16' },
          ],
        },
        {
          section: 'TASTING MENU',
          note: 'Entire table must participate',
          items: [
            { item: 'Food', price: '$100 pp' },
            { item: 'Wine Pairing', price: '$80 pp' },
          ],
        },
      ],
    },
  ],

  'Bar Henry': [
    {
      label: 'FOOD',

      sections: [
        {
          section: 'SALATINI',
          items: [
            { item: 'Olives', description: 'Lemon, olive oil', price: '$8' },
            { item: 'Pistachios', description: 'Salted', price: '$6' },
          ],
        },
        {
          section: 'STUZZICHINI',
          note: 'Snack sized antipasti',
          items: [
            { item: 'Gilda Siciliana', description: 'Caper berry & leaf, artichoke, anchovy, salsa verde', price: '$4' },
            { item: 'Uovo ✦', description: 'Soft-boiled egg, tonnato, anchovy, capers', price: '$13' },
            { item: 'Insalata', description: 'Celery, fennel, roasted walnuts, parmigiano', price: '$16' },
            { item: 'Maître d\' Panini', description: 'Anchovy, maître d\' butter', price: '$9' },
            { item: 'Wagyu Tartare', description: 'Radish, cornichon, chives, horseradish aioli, endive', price: '$17' },
            { item: 'Roasted Mushrooms', description: 'Egg yolk', price: '$13' },
            { item: 'Whipped Ricotta', description: 'Black truffle, grilled ciabatta', price: '$16' },
            { item: 'Baked Gnudi', description: 'With sage, brown butter, parmigiano', price: '$15' },
            { item: 'Baked Gnudi — Radicchio', description: 'With radicchio, walnut, balsamico vecchio, gorgonzola', price: '$19' },
            { item: 'Norcina Sausage', description: 'Parmigiano, nutmeg, pepper', price: '$17' },
          ],
        },
        {
          section: 'TRAMEZZINI',
          note: 'Crustless Italian sandwiches',
          items: [
            { item: 'The Millie ✦', description: 'Black truffle pecorino, honey', price: '$19' },
            { item: 'The Henry ✦', description: 'Mortadella, taleggio, horseradish', price: '$19' },
          ],
        },
        {
          section: 'DOPO',
          items: [
            { item: 'Tiramisu', description: 'Biscuits, espresso, liqueur, mascarpone cheese', price: '$16' },
          ],
        },
      ],
    },
    {
      label: 'DRINKS',
      sections: [
        {
          section: 'AMARO',
          note: '1.5 oz',
          items: [
            { item: 'Cynar', price: '$10' },
            { item: 'Cardamaro', price: '$10' },
            { item: 'Fernet Branca', price: '$10' },
            { item: 'Montenegro', price: '$10' },
            { item: 'Fernet Lazzaroni', price: '$10' },
            { item: 'Nardini Mezzo Mezzo', price: '$10' },
            { item: 'Rossi d\'Asiago', price: '$10' },
            { item: 'Nonino', price: '$12' },
            { item: 'Tosolini', price: '$12' },
            { item: 'Sibilla', price: '$12' },
            { item: 'Fernet Hunter', price: '$12' },
            { item: 'Cocchi Dopo Teatro', price: '$12' },
            { item: 'Marolo Ulrich', price: '$12' },
            { item: 'Nardini Rabarbaro', price: '$12' },
          ],
        },
        {
          section: 'GRAPPA',
          note: '1 oz',
          items: [
            { item: 'Marolo Gli Alberi', price: '$10' },
            { item: 'Poli Torcolato', price: '$15' },
            { item: 'Poli Vespaiolo', price: '$15' },
          ],
        },
        {
          section: 'ALTRI',
          note: '1 oz',
          items: [
            { item: 'Park Distillery Banff Whiskey', price: '$14' },
            { item: 'Blanton\'s Special Reserve Bourbon', price: '$30' },
            { item: 'Toki Japanese Whiskey', price: '$12' },
            { item: 'Nikka Yoichi Japanese Whiskey', price: '$14' },
            { item: 'Laphroaig Quarter Cask Scotch — Islay', price: '$16' },
            { item: 'Pierre Ferrand "1840" Cognac', price: '$14' },
            { item: 'Adrien Camut 12 Year Calvados', price: '$20' },
            { item: 'Willibald Canadian Gin', price: '$12' },
            { item: 'Park Distillery Alpine Gin', price: '$10' },
            { item: 'Del Professore Italian Gin', price: '$10' },
            { item: 'Plymouth English Gin', price: '$10' },
            { item: 'Roku Japanese Gin', price: '$10' },
            { item: 'Don Fulano Blanco Tequila', price: '$12' },
            { item: 'Don Mateo Mezcal', price: '$12' },
            { item: 'Cocchi Storico Vermouth', description: '2 oz', price: '$12' },
            { item: 'Borgogno Bianco Vermouth', description: '2 oz', price: '$12' },
            { item: 'Borgogno Chinato Vermouth', description: '2 oz', price: '$12' },
          ],
        },
      ],
    },
    {
      label: 'COCKTAILS',
      sections: [
        {
          section: 'COCKTAILS',
          note: 'Aperitivo (Happy) Hour 3–5pm daily · Wed–Thu 3–10pm · Fri–Sat 3–11pm',
          items: [
            { item: 'Spritz ✦', description: 'Venetian Bitter, Prosecco, Orange, Olive', price: '$19' },
            { item: 'Campari & Tonic', description: 'Orange, Mediterranean Tonic', price: '$15' },
            { item: 'Americano', description: 'Campari, Pimm\'s, Amaro, Soda', price: '$17' },
            { item: 'Sbagliato', description: 'Campari, Cocchi Vermouth, Prosecco', price: '$19' },
            { item: 'Classic Negroni', description: 'Dillon\'s Gin, Campari, Cocchi Vermouth', price: '$18' },
            { item: 'Kingston Negroni', description: 'Appleton Rum, Punt e Mes, Campari, Cocchi Vermouth, Salt', price: '$18' },
            { item: 'Petit Rouge', description: 'Pierre Ferrand Cognac, Campari, Bitter Banana Liqueur', price: '$21' },
            { item: 'Heads & Tails', description: 'Brandy, Sherry Cordial, Canadian Rye & Bitter Chocolate', price: '$19' },
            { item: 'Jerez Sidecar #2', description: 'Oloroso Sherry, Cognac, Lemon, Above Average Coriander', price: '$19' },
            { item: 'Galleria', description: 'Dillon\'s Vodka, Spiced Pomegranate, Clementine, Select', price: '$20' },
            { item: 'Portofino', description: 'Hamilton Rum, Brancamenta, Lemon & Peach', price: '$18' },
            { item: 'Henry\'s Negroni', description: 'Campari, Dillon\'s Gin, Cocchi Vermouth & Barolo Chinato', price: '$21' },
            { item: 'Corso Como ✦', description: 'Dillon\'s, Plymouth, & Park Alpine Gins, Henry\'s Vermouth Blend, Olive', price: '$21' },
          ],
        },
      ],
    },
    {
      label: 'WINE',
      sections: [
        {
          section: 'BY THE GLASS',
          note: '5 oz / bottle',
          items: [
            { item: 'Raventós i Blanc Blanc de Blancs', description: '2023 · Catalunya', price: '$21 / $105' },
            { item: 'Cozzarolo Friulano', description: '2024 · Friuli-Venezia Giulia', price: '$17 / $85' },
            { item: 'Albino Rocca "da Bertu" Chardonnay', description: '2023 · Piemonte', price: '$18 / $90' },
            { item: 'Ghisolfi "Faule" Chiaretto Rosato', description: '2024 · Veneto', price: '$18 / $90' },
            { item: 'Fletcher "Arcato" Arneis et al. Macerato', description: '2024', price: '$30 / $150' },
            { item: 'Ca\' del Baio Nebbiolo', description: '2023 · Piemonte', price: '$17 / $85' },
            { item: 'Mario Giribaldi Barbaresco', description: '2014 · Piemonte', price: '$39 / $195' },
            { item: 'Brigaldara Valpolicella Classico', description: '2023 · Veneto', price: '$15 / $75' },
            { item: 'Bertani "Valpantena" Amarone', description: '2019 · Veneto', price: '$30 / $150' },
          ],
        },
        {
          section: 'CHAMPAGNE',
          note: 'Bottle',
          items: [
            { item: 'Etienne Calsac "L\'Échappée Belle" Chardonnay', description: 'NV', price: '$175' },
            { item: 'Bérèche et Fils "Brut Réserve" Assemblage', description: 'NV', price: '$200' },
            { item: 'Agrapart et Fils "7 Crus" Chardonnay', description: 'NV', price: '$200' },
            { item: 'Remi-Leroy "Les Crots" Rosé Saignée Pinot Noir', description: '2018', price: '$200' },
            { item: 'Delamotte "Blanc de Blancs" Chardonnay', description: '2018', price: '$275' },
            { item: 'Pascal Agrapart "Vénus" Chardonnay Grand Cru', description: '2019', price: '$450' },
          ],
        },
        {
          section: 'BIANCO E MACERATO',
          note: 'Bottle',
          items: [
            { item: 'Vinchio Vaglio Cortese', description: '2023 · Piemonte', price: '$75' },
            { item: 'Antoniolo Erbaluce di Caluso', description: '2024 · Alto Piemonte', price: '$95' },
            { item: 'Brandini "Le Margherite" Arneis', description: '2024 · Piemonte', price: '$100' },
            { item: 'Prà "Staforte" Soave Garganega', description: '2023 · Veneto', price: '$100' },
            { item: 'Fletcher "C24" Chardonnay', description: '2024 · Piemonte', price: '$150' },
            { item: 'Cascina Penna-Currado Timorasso', description: '2023 · Piemonte', price: '$175' },
            { item: 'Denavolo "Dinavolo" Malvasia et al. Macerato', description: '2020 · Emilia', price: '$160' },
          ],
        },
        {
          section: 'ROSSO',
          note: 'Bottle',
          items: [
            { item: 'Case Paolin "Campo del Morer" Cabernet Sauv.', description: '2023 · Veneto', price: '$65' },
            { item: 'Savian Pinot Nero', description: '2022 · Veneto', price: '$70' },
            { item: 'Vajra "Monterustico" Nebbiolo et al.', description: '2023 · Piemonte', price: '$75' },
            { item: 'Crotin "Cisero" Freisa Superiore', description: '2018 · Piemonte', price: '$85' },
            { item: 'Chiara Condello Sangiovese', description: '2022 · Emilia-Romagna', price: '$100' },
            { item: 'Fletcher Langhe Nebbiolo', description: '2022 · Piemonte', price: '$110' },
            { item: 'Mario Giribaldi "Ravera" Barolo', description: '2014 · Piemonte', price: '$150' },
            { item: 'Cascina Penna-Currado Barbera d\'Alba', description: '2023 · Piemonte', price: '$185' },
            { item: 'Fletcher "Recce Pete" Barbaresco', description: '2022 · Piemonte', price: '$190' },
            { item: 'Le Pianelle "Bramaterra" Nebbiolo', description: '2019 · Alto Piemonte', price: '$200' },
            { item: 'Brigaldara "Case Vecie" Amarone', description: '2018 · Veneto', price: '$240' },
            { item: 'Proprietà Sperino "Lessona" Nebbiolo', description: '2018 · Piemonte', price: '$280' },
            { item: 'Sandrone "Aleste" Barolo', description: '2014 · Piemonte', price: '$300' },
            { item: 'G. Cortese "Rabajà" Barbaresco Riserva', description: '2016 · Piemonte', price: '$300' },
            { item: 'ArPePe "Rocce Rosse" Valtellina Riserva', description: '2018 · Lombardia', price: '$300' },
            { item: 'ArPePe "Nuova Regina" Valtellina Riserva', description: '2018 · Lombardia', price: '$300' },
            { item: 'ArPePe "Ultimi Raggi" Valtellina Riserva', description: '2018 · Lombardia', price: '$300' },
            { item: 'Azelia "Margheria" Barolo', description: '2011 · Piemonte', price: '$350' },
          ],
        },
        {
          section: 'BIRRA & NON ALCOLICO',
          items: [
            { item: 'Peroni Lager', description: '330mL', price: '$9' },
            { item: 'Ferrarelle Sparkling or Still Water', description: '750mL', price: '$10' },
            { item: 'Noughty Sparkling Chardonnay', description: '250mL', price: '$15' },
            { item: 'Cipriani White Peach Bellini', description: '250mL', price: '$15' },
            { item: 'Coca Cola Classic', price: '$6' },
            { item: 'Stappi Crodino or Red Bitter', price: '$4' },
          ],
        },
      ],
    },
  ],

  'Va': [
    {
      label: 'BREAKFAST',
      sections: [
        {
          section: 'PASTRIES & FOOD',
          note: '8am – 11am',
          items: [
            { item: 'Citrus & Olive Oil Cookie', price: '$5' },
            { item: 'Crostata', description: 'Almond & apricot marmellata', price: '$9' },
            { item: 'Maritozzo', description: 'Pistachio crema & mascarpone', price: '$10' },
            { item: 'Yogurt & Frutta', description: 'Fresh citrus, apricot marmellata, pistachio, wildflower honey', price: '$13' },
          ],
        },
        {
          section: 'PANINI',
          items: [
            {
              item: 'Va Breakfast Panino',
              description: 'House brioche bun, egg, pecorino crema & arugula',
              price: '$13',
              addOns: [{ item: 'Prosciutto Cotto', price: '+$3' }],
            },
            {
              item: 'Cotto Filone',
              description: 'House-made prosciutto cotto, parmigiano butter & horseradish',
              price: '$12',
            },
          ],
        },
        {
          section: 'PIZZA',
          items: [
            { item: 'Pizza Rossa', description: 'San Marzano tomato, olive oil', price: '$9' },
            { item: 'Rossa Diavola', description: 'Sunny egg, Va chili oil, pecorino, pangrattato', price: '$14' },
            {
              item: 'Potato & Pancetta',
              description: 'Rosemary, pecorino, provolone, lemon',
              price: '$13',
              addOns: [{ item: 'Add egg', price: '+$2.50' }],
            },
          ],
        },
        {
          section: 'CAFFÈ',
          items: [
            { item: 'Espresso', price: '$4' },
            { item: 'Americano', price: '$5' },
            { item: 'Cortado', price: '$5' },
            { item: 'Cappuccino', price: '$5' },
            { item: 'Caffè Latte', price: '$6' },
            { item: 'Caffè Corretto', description: 'Sambuca or Grappa (0.3 oz)', price: '$6' },
          ],
        },
        {
          section: 'DRINKS',
          items: [
            { item: 'Tea', price: '$5' },
            { item: 'Bimbi', description: 'Steamed milk with honey or vanilla', price: '$5' },
            { item: 'Schiaffo \'Slap\'', description: 'Espresso, rabarbaro, sweet cream', price: '$10' },
            { item: 'House Soda', description: 'Ginger & Citrus · Sour Cherry · Pomegranate Hibiscus', price: '$8' },
            { item: 'Crodino', price: '$5' },
            { item: 'Aranciata', price: '$4' },
            { item: 'Coca Cola Classic', price: '$4' },
            { item: 'Diet Coca Cola', price: '$3.50' },
            { item: 'Sparkling Water', description: 'Sm / Lg', price: '$3 / $6' },
          ],
        },
      ],
    },
    {
      label: 'LUNCH',
      sections: [
        {
          section: 'PANINI',
          note: '11am – 3pm · house-made ciabatta, baked fresh daily',
          items: [
            { item: 'Genovese', description: 'Braised beef & onion ragu, pecorino crema', price: '$20' },
            { item: 'Porchetta', description: 'Roasted pork belly, salsa verde, salsa rossa', price: '$17' },
            { item: 'Mortadella', description: 'Black truffle ricotta, arugula, parmigiano', price: '$18' },
            { item: 'Orto', description: 'Chickpea, roasted zucchini, Va chili oil, peperonata, mint', price: '$18' },
            { item: 'Feature Panino', description: 'Ask us!' },
          ],
        },
        {
          section: 'PIZZA AL TAGLIO',
          items: [
            { item: 'Pizza Rossa', description: 'San Marzano tomato, olive oil', price: '$9' },
            { item: 'Rossa & Stracciatella', description: 'San Marzano tomato, stracciatella, basil, olive oil', price: '$14' },
            { item: 'Potato & Pancetta', description: 'Rosemary, pecorino, provolone, lemon', price: '$13' },
            { item: 'Rossa Diavola', description: 'Sunny egg, Va chili oil, pecorino, pangrattato', price: '$14' },
            { item: 'Tartufo', description: 'Leeks, truffle, pecorino, honey', price: '$14' },
            { item: 'Feature Slice', description: 'Ask us!' },
          ],
        },
        {
          section: 'SALADS',
          note: 'Add Italian tuna +$5 · add soft boiled egg +$3',
          items: [
            { item: 'Kale', description: 'Pecorino vinaigrette, red onion, pangrattato', price: '$8 / $15' },
            { item: 'Tuscan Bean', description: 'White beans, red onion, celery, capers & salsa verde', price: '$7 / $14' },
          ],
        },
        {
          section: 'CAFFÈ',
          items: [
            { item: 'Espresso', price: '$4' },
            { item: 'Americano', price: '$5' },
            { item: 'Cortado', price: '$5' },
            { item: 'Cappuccino', price: '$5' },
            { item: 'Caffè Latte', price: '$6' },
            { item: 'Caffè Corretto', description: 'Sambuca or Grappa (0.3 oz)', price: '$6' },
          ],
        },
        {
          section: 'DRINKS',
          items: [
            { item: 'Tea', price: '$5' },
            { item: 'Bimbi', description: 'Steamed milk with honey or vanilla', price: '$5' },
            { item: 'Schiaffo \'Slap\'', description: 'Espresso, rabarbaro, sweet cream', price: '$10' },
            { item: 'House Soda', description: 'Ginger & Citrus · Sour Cherry · Pomegranate Hibiscus', price: '$8' },
            { item: 'Spritz', description: 'Campari · Aperol · Vermouth', price: '$15' },
            { item: 'Prosecco', description: '5oz glass / bottle', price: '$14 / $56' },
            { item: 'Bianco / Rosato / Rosso', price: '$38' },
            { item: 'Peroni alla Spina', description: '330ml Italian pale lager on tap', price: '$9' },
            { item: 'Crodino', price: '$5' },
            { item: 'Aranciata', price: '$4' },
            { item: 'Coca Cola Classic', price: '$4' },
            { item: 'Diet Coca Cola', price: '$3.50' },
            { item: 'Sparkling Water', description: 'Sm / Lg', price: '$3 / $6' },
          ],
        },
      ],
    },
  ],

  'kind ice cream': [
    {
      label: 'MENU',
      sections: [
        {
          section: 'ICE CREAM',
          items: [
            { item: 'Kids Scoop', price: '$4' },
            { item: 'Single Scoop', price: '$6' },
            { item: 'Double Scoop', price: '$8' },
            { item: 'Pint', price: '$12' },
          ],
        },
        {
          section: 'FLAVOURS',
          items: [
            { item: 'Vanilla Bean' },
            { item: 'Chocolate Milk' },
            { item: 'Mint Chip' },
            { item: 'Salted Caramel' },
            { item: 'Real Deal Strawberry' },
            { item: 'Cookies & Cream' },
            { item: 'Birthday Cake' },
            { item: 'Banana Cream Pie' },
            { item: 'Cold Brew Coffee' },
            { item: 'Disco Cookie Dough' },
            { item: 'Maple Whisky Pecan' },
            { item: 'River Valley Road' },
            { item: 'Carrot Cake' },
            { item: 'Berry Panna Cotta' },
            { item: 'Shirley Temple Sorbet', tags: ['Vegan'] },
            { item: 'Chocolate Honeycomb', tags: ['Vegan'] },
            { item: 'Lemon & Jammy Raspberry', tags: ['Vegan'] },
          ],
        },
        {
          section: 'ADD-ONS',
          items: [
            { item: 'Waffle Cone', price: '$1.50' },
            { item: 'Gluten-Free Cone', price: '$1' },
            { item: 'Ice Cream for Pups', price: '$1' },
          ],
        },
      ],
    },
  ],

  'Ace coffee': ACE_COFFEE_MENU,
  'Ace Coffee': ACE_COFFEE_MENU,
  'Ace Coffee — 97 Street': ACE_COFFEE_MENU,
  'Ace Coffee — 101 Street': ACE_COFFEE_MENU,
  'Ace Coffee — 80 Avenue': ACE_COFFEE_MENU,
  'Ace Coffee — Garneau': ACE_COFFEE_MENU,

  'Farrow — Garneau': FARROW_MENU,
  'Farrow — Ritchie': FARROW_MENU,
  'Farrow — 124 Street': FARROW_MENU,
  'Farrow — Jasper Ave': FARROW_MENU,

  'Seoul Fried': [
    {
      label: 'MENU',
      sections: [
        {
          section: 'BOX SETS',
          note: 'Individual · single serving',
          items: [
            {
              item: 'Big Seoul Set 4pcs',
              description: 'Drumstick, Thigh, Wing and a Tender piece one flavoured tossed or sauce on the side, ½ hot side AND ½ cold side, Pop',
              price: '$17.50',
              addOns: [{ item: 'Double cold salad', price: '$2.50' }],
            },
            {
              item: 'Lil Seoul Set 2pcs',
              description: 'Tender and Thigh, one flavoured tossed or sauce on the side, ½ hot side OR ½ cold side, Pop',
              price: '$13.50',
            },
            {
              item: 'Chicken only / Tender only 4pcs',
              description: 'Drumstick, Thigh, Wing and a Tender piece one flavoured tossed or sauce on the side',
              price: '$11/$13',
              addOns: [{ item: 'Extra pieces', price: '$3 ea' }],
            },
            {
              item: 'Big Tender Set 4pcs',
              description: 'One flavoured tossed or sauce on the side, ½ hot side AND ½ cold side, Pop',
              price: '$19.50',
              addOns: [{ item: 'Double cold salad', price: '$2.50' }],
            },
            {
              item: 'Lil Tender Set 2pcs',
              description: 'One flavoured tossed or sauce on the side, ½ hot side OR ½ cold side, Pop',
              price: '$14.50',
            },
            {
              item: 'SFC Crispy Thigh Chicken Sandwich',
              description: 'Gochujang Butter, OG or any SFC flavours',
              price: '$11',
              addOns: [{ item: 'Breast meat', price: '+$1' }],
            },
            {
              item: 'Big Sandwich Set',
              description: 'Gochujang Butter, OG or any SFC flavours, one flavoured tossed or sauce on the side, ½ hot side AND ½ cold side, Pop',
              price: '$17.50',
              addOns: [
                { item: 'Breast meat', price: '+$1' },
                { item: 'Double cold salad', price: '$2.50' },
              ],
            },
            {
              item: 'Lil Seoul Sandwich Set',
              description: 'Gochujang Butter, OG or any SFC flavours, one flavoured tossed or sauce on the side, ½ hot side OR ½ cold side, Pop',
              price: '$13.50',
              addOns: [{ item: 'Breast meat', price: '+$1' }],
            },
          ],
        },
        {
          section: 'SIGNATURE FLAVOURS',
          note: 'Sauce by the oz: 4oz / 8oz / 16oz — $3.50 / $7 / $14',
          items: [
            { item: 'SFC OG' },
            { item: 'SFC Sweet BBQ', description: 'Heat tossed' },
            { item: 'SFC Garlic Soy', description: 'Heat tossed' },
            { item: 'SFC G.P Cheese' },
            { item: 'SFC Hot Mustard', description: 'Sauce on the side only' },
            { item: 'SFC Cilantro Lime', description: 'Sauce on the side only' },
            { item: 'SFC Golden Kari Powder', description: 'Dry tossed only' },
            { item: 'SFC Gochujang Caramel', description: 'Heat tossed' },
            { item: 'SFC Chipotle Spicy BBQ', description: 'Heat tossed' },
            { item: 'SFC Gochugaru Garlic Soy', description: 'Heat tossed' },
            { item: 'SFC Serrano GP Cheese' },
          ],
        },
        {
          section: 'CHICKEN BOX',
          note: 'Serves 2–8',
          items: [
            {
              item: 'Chicken BOX 8pcs / 16pcs / 24pcs',
              description: 'Includes 4 cuts: Drumstick, Wing, Tender, and Thigh. Choose up to 2 SFC Signature Flavours per box.',
              price: '$21 / $40 / $60',
              addOns: [{ item: 'Extra pieces', price: '$3 ea' }],
            },
            {
              item: 'Tender BOX 8pcs / 16pcs / 24pcs',
              description: 'Choose up to 2 SFC Signature Flavours per box.',
              price: '$24 / $45 / $67',
              addOns: [{ item: 'Extra pieces', price: '$3 ea' }],
            },
          ],
        },
        {
          section: 'HOT SIDES',
          items: [
            { item: 'Seoul Fried Plain Rice', description: 'Regular / Large', price: '$4 / $9' },
            { item: 'Seoul Fried Dirty Rice', description: 'Regular / Large', price: '$4 / $9' },
            { item: 'Buttermilk Chicken Gravy', description: '8oz / 12oz', price: '$3.50 / $6' },
            { item: 'House Cut Russet Fries', description: 'Regular / Large', price: '$4 / $9' },
            { item: 'Banana Corn Fritter', description: '1 pc / 3 pcs · with Vanilla Cream', price: '$2.50 / $6' },
            { item: 'Cheddar Jalapeño Corn Fritter', description: '1 pc / 3 pcs', price: '$2.75 / $7' },
          ],
        },
        {
          section: 'COLD SIDES',
          items: [
            { item: 'Kale Caesar Salad', price: '$8' },
            { item: 'Black Sesame Slaw', price: '$7' },
            { item: 'Mac n\' Cheese Pesto Salad', price: '$8' },
            { item: 'SFC Kimchi', description: '8oz / 16oz', price: '$6 / $10' },
            { item: 'SFC Sweet Butter Cukes', description: '4oz / 8oz', price: '$4 / $6' },
          ],
        },
        {
          section: 'DESSERTS & DRINKS',
          items: [
            { item: 'Berry Coconut Chia Pudding', price: '$6' },
            { item: 'DRTY Ice Cream', description: '4oz / 16oz · Mangga Gala, Sana Ali, Salted MNB (Salted Caramel)', price: '$5 / $11' },
            { item: 'Pop', price: '$2.50' },
            { item: 'Alcoholic options', description: 'Ask your server' },
          ],
        },
      ],
    },
  ],

  'Delavoye Chocolate Maker': [
    {
      label: 'MENU',
      sections: [
        {
          section: 'SPECIALITY CHOCOLATE DRINKS',
          items: [
            { item: 'European Drinking Chocolate', description: 'Marshmallow · gluten-free', price: '$3.50 (3oz) / $6.65 (6oz)' },
            { item: 'Delavoye Hot Chocolate', description: 'Iced or hot · marshmallow · gluten-free', price: '$6.50' },
            { item: 'Seasonal Rotating Hot Chocolate', description: 'Marshmallow · vegan · gluten-free', price: '$6.75' },
            { item: 'Cacao Husk Tea', price: '$4.75' },
            { item: 'Iced Vietnamese Mocha', description: 'Vegan · gluten-free', price: '$6.75' },
            { item: 'Cacao Coffee Cold Brew', price: '$6.50' },
            { item: 'Nibby Chai Latte', description: 'Iced or hot', price: '$7.00' },
            { item: 'House Mocha', description: 'Iced or hot', price: '$8.00' },
          ],
        },
        {
          section: 'NOT CHOCOLATE',
          items: [
            { item: 'Espresso', price: '$4.00' },
            { item: 'Cortado', price: '$5.00' },
            { item: 'Cappuccino', price: '$6.00' },
            { item: 'Flat White', price: '$6.50' },
            { item: 'Americano', description: 'Iced or hot', price: '$4.50' },
            { item: 'Latte', description: 'Iced or hot', price: '$7.00' },
            { item: 'Pour-Over Coffee', description: 'For one (8oz) / For two (2 × 8oz)', price: '$4.50 / $7.50' },
          ],
        },
        {
          section: 'TREATS',
          items: [
            { item: 'Chocolate Chunk Cookie', price: '$3.75' },
            { item: 'Amaretti Cookie', description: 'Gluten-free', price: '$2.25' },
            { item: 'Miso Caramel Square', price: '$5.65' },
            { item: 'Brownie', description: 'Bite / Square', price: '$2.25 / $5.50' },
            { item: 'Truffle', description: 'Each / Box of 12', price: '$3.00 / $36.00' },
            { item: 'Chocolate Fruit — Dipped', description: 'Mango slice / Sour plum', price: '$7.50 / $8.00' },
            { item: 'Chocolate Fruit — Tumbled', description: 'Sour cherries / Strawberry / Macadamia nuts', price: '$18.00 / $12.00 / $12.00' },
          ],
        },
      ],
    },
  ],

  'Duchess Bake Shop': [
    {
      label: 'BAKE SHOP',
      sections: [
        {
          section: 'MACARONS',
          items: [
            { item: 'Lemon Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Pistachio Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Rose Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Salted Caramel Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Vanilla Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Cookies & Cream Macaron', description: 'Crisp vanilla shell filled with a smooth, creamy gluten-free cookie crumb buttercream', price: '$2.75' },
            { item: 'Amarena Cherry Macaron', description: 'Crisp, delicate shell with a luscious Amarena cherry-infused filling', price: '$2.75' },
            { item: 'Macaron Gift Box', description: 'Box of seven assorted macarons', price: '$24.00' },
          ],
        },
        {
          section: 'CAKES',
          items: [
            { item: 'Basque Cheesecake (Large)', description: 'Rich and creamy cheesecake with a light burn on top', price: '$60.00' },
            { item: 'Duchess Cake', description: 'Lemon chiffon cake, raspberry rose jam, vanilla pastry cream, whipped ganache, green marzipan · contains nuts', price: '$64.00' },
            { item: 'Duke Cake (Large)', description: 'Dense chocolate cake, salted caramel, whipped Valrhona chocolate ganache, mirror-finish chocolate glaçage', price: '$74.00' },
            { item: 'Duke Cake (Small)', description: 'Dense chocolate cake, salted caramel, whipped Valrhona chocolate ganache, mirror-finish chocolate glaçage', price: '$15.00' },
            { item: 'Gateau Juliette', description: 'Caramelized coconut base, coconut sponge, strawberry compote, raspberry mousse, coconut whipped ganache, vanilla white chocolate glaze', price: '$52.00' },
            { item: 'Lemon Meringue Cake (Large)', description: 'Lemon chiffon cake, salted caramel, lemon cream, toasted meringue', price: '$48.00' },
            { item: 'Lemon Marmalade Blueberry Coffee Cake', description: 'Blueberry lemon zest coffee cake, lemon marmalade glaze, vanilla crumb', price: '$7.50' },
          ],
        },
        {
          section: 'TARTS',
          items: [
            { item: 'Butter Tart', description: 'Flaky pastry with a gooey caramel filling and raisins', price: '$4.00' },
            { item: 'Mango Graham Tart (Small)', description: 'Graham-cashew crust, mango cream, yuzu gel, mango compote, vanilla bean whipped ganache · contains nuts', price: '$15.00' },
            { item: 'Tarte Au Pêche', description: 'Pâte sucrée, vanilla financier, lavender-lemon poached peaches, peach-lavender glaze · contains nuts', price: '$7.50' },
            { item: 'Tart — Amélie (Large)', description: 'Vanilla tart shell, rhubarb cassis compote, sour cream mousse, rose Chantilly, buckwheat honey madeleine · contains gelatin, nuts', price: '$58.00' },
            { item: 'Tart — Amélie (Small)', description: 'Vanilla tart shell, rhubarb cassis compote, sour cream mousse, rose Chantilly, buckwheat honey madeleine · contains gelatin, nuts', price: '$14.00' },
            { item: 'Passion Fruit Raspberry Tartlette', description: 'Passion fruit whipped ganache, raspberry crémeux dome, almond tartlette shell · contains gelatin, nuts', price: '$6.00' },
          ],
        },
        {
          section: 'PIES',
          items: [
            { item: 'Banana Cream Pie (Large)', description: 'Flaky crust, vanilla bean pastry cream, fresh bananas, whipped cream', price: '$36.00' },
            { item: 'Banana Cream Pie (Small)', description: 'Flaky crust, vanilla bean pastry cream, fresh bananas, whipped cream', price: '$14.00' },
            { item: 'Rhubarb Galette', description: 'Rustic rhubarb tart with flaky pastry and sweet oat crumb', price: '$7.50' },
            { item: 'Sour Cream Cherry Pie (Large)', description: 'Available year-round', price: '$36.00' },
            { item: 'Sour Cream Cherry Pie (Small)', description: '1–2 servings · available year-round', price: '$12.50' },
          ],
        },
        {
          section: 'COOKIES',
          items: [
            { item: 'Brownie', description: 'Triple chocolate and pecan, chocolate drizzle, chopped pecans, cocoa nibs', price: '$4.25' },
            { item: 'Mango Coconut Cookie', description: 'Dried mango, coconut, coconut shards, passion fruit chocolate', price: '$6.00' },
            { item: 'Oatmeal Milk Chocolate Cookie', description: 'Hearty oats, creamy milk chocolate, cinnamon', price: '$3.95' },
            { item: 'Yuzu Raspberry Caramel Shortbread', description: 'Classic Duchess shortbread, yuzu caramel, freeze dried raspberries', price: '$3.00' },
          ],
        },
        {
          section: 'MACARON GÂTEAU',
          items: [
            { item: 'Raspberry Peach Macaron Gâteau (Large)', description: 'Macaron shells, almond buttercream, raspberry whipped ganache, apricot curd, vanilla-sautéed peaches · contains gelatin, nuts', price: '$58.00' },
            { item: 'Raspberry Peach Macaron Gâteau (Small)', description: 'Gluten-free · buttercream, ganache, sautéed peaches, raspberries, almonds between macaron cookies · contains gelatin, nuts', price: '$14.00' },
          ],
        },
        {
          section: 'SCONES',
          items: [
            { item: 'Blueberry Lemon Scone', description: 'Juicy blueberries, lemon zest, lemon glaze', price: '$6.00' },
            { item: 'Cream Cheese & Everything Spice Scone', description: 'Cream cheese crumb, everything spice seasoning · contains sesame', price: '$6.00' },
          ],
        },
        {
          section: 'VIENNOISERIE',
          items: [
            { item: 'Classic Croissant', description: 'Traditional, made with 84% imported butter', price: '$5.00' },
            { item: 'Pain Au Chocolat', description: 'Valrhona milk and dark chocolate in traditional croissant dough', price: '$6.50' },
            { item: 'Gruyère Croissant', description: 'Traditional croissant filled and topped with Swiss gruyère', price: '$7.00' },
            { item: 'Brioche Pépin', description: 'Laminated brioche dough, vanilla bean pastry cream, Callebaut milk chocolate chips', price: '$7.00' },
            { item: 'Pistachio Rose Roulé', description: 'Croissant dough, pistachio and rose cream, pistachio praline ganache, honey rose glaze · contains nuts', price: '$7.00' },
            { item: 'Raspberry Chocolate Brioche', description: 'Pillowy brioche, chocolate orange pastry cream, raspberry compote, fresh raspberries', price: '$5.25' },
          ],
        },
        {
          section: 'OTHER BAKED GOODS',
          items: [
            { item: 'Hummingbird Loaf', description: 'Banana, crushed pineapple, toasted pecans, cinnamon, vanilla bean cream cheese frosting · contains nuts', price: '$5.25' },
            { item: 'Coconut Lime Madeleine', description: 'Lime and coconut, coconut-lime glaze, toasted coconut, lime zest', price: '$3.00' },
          ],
        },
      ],
    },
    {
      label: 'PROVISIONS',
      sections: [
        {
          section: 'PROVISIONS BY DUCHESS',
          items: [
            { item: 'Apple Earl Grey Jelly', description: 'Apple juice, sugar, lemon juice, Earl Grey tea', price: '$16.00' },
            { item: 'Fruit Ketchup', description: 'French-Canadian fruit ketchup · tomatoes, apples, onions, peppers, sugar, vinegar, pickling spices', price: '$14.00' },
            { item: 'Salted Caramel (250ml)', description: 'Decadent house-made salted caramel', price: '$14.00' },
            { item: 'Raspberry Rose Jam', description: 'High-quality raspberries with delicate rose flavour', price: '$14.00' },
            { item: 'Hot Chocolate Mix (170g)', description: 'Dark chocolate 67%, milk chocolate, cocoa powder, cardamom, allspice, nutmeg', price: '$24.00' },
            { item: 'Provence Tea Infused Honey (340g)', description: 'Wildflower nectar honey infused with Duchess Blend Provence Tea · assam, lavender, bergamot, cornflowers', price: '$20.00' },
            { item: 'Traditional Pancake Mix', description: 'One bag makes 4 batches of 6–8 pancakes', price: '$17.25' },
            { item: 'Triple Chocolate Cookie Kit', description: 'Makes signature double chocolate cookies at home', price: '$26.00' },
            { item: 'Duchess x RGE RD Tourtière', description: 'House-made French-Canadian meat pie, flaky crust, locally sourced meats', price: '$40.00' },
            { item: 'Duchess Apron', description: 'Navy blue adjustable bib apron, Duchess Bake Shop logo embroidered in gold', price: '$54.00' },
          ],
        },
        {
          section: 'DUCHESS BLEND TEAS',
          items: [
            { item: 'Provence Tea (115g)', description: 'Ceylon blend with bergamot orange, lavender, and dried lavender buds', price: '$25.00' },
            { item: "L'Amour Tea (115g)", description: 'Raspberry, rose, and lychee with Darjeeling black tea', price: '$25.00' },
            { item: 'Kumaru Tea (115g)', description: 'TGFOP Darjeeling with tonka bean · notes of cinnamon, nutmeg, vanilla, toasted almond, amarena cherry', price: '$25.00' },
            { item: 'Paris Matin Tea (125g)', description: 'Rich and malty breakfast blend, pairs perfectly with milk', price: '$25.00' },
            { item: 'Panache Tea', description: 'Darjeeling, Assam, bergamot, tonka bean, orange peel, lemon peel, black lime, hibiscus · brews soft blush-pink', price: '$25.00' },
            { item: 'Seasonal Tea Trio', description: '15g per tin', price: '$30.00' },
          ],
        },
        {
          section: 'BAKING INGREDIENTS',
          items: [
            { item: 'All-Purpose Flour (5kg)', description: 'Unbleached bakery grade flour', price: '$24.00' },
            { item: 'Bread Flour (5kg)', price: '$24.00' },
            { item: 'Almond Flour (500g)', price: '$20.00' },
            { item: 'Buttermilk Powder (300g)', price: '$12.00' },
            { item: 'Pearl Sugar (300g)', price: '$14.50' },
            { item: 'Fleur de Sel (100g)', price: '$10.00' },
            { item: 'Feuilletine (200g)', price: '$18.00' },
            { item: 'Crystallized Ginger (250g)', description: 'Ginger, cane sugar', price: '$18.00' },
            { item: 'Amarena Cherries in Syrup (250ml)', price: '$16.00' },
            { item: 'Egg Albumen (75g)', price: '$13.00' },
            { item: 'Culinary Lavender (10g)', price: '$8.00' },
            { item: 'Dried Rose Petals (10g)', price: '$8.00' },
            { item: 'Tonka Beans (5 beans)', price: '$12.00' },
            { item: 'Pistachio Extract (45ml)', price: '$34.00' },
            { item: 'Powder Food Colouring', description: 'Blue / Green / Red / Yellow (7g each)', price: '$15.00 each' },
            { item: 'Nielsen-Massey Vanilla Bean Paste (118ml)', description: 'Pure vanilla extract with real vanilla seeds', price: '$45.00' },
          ],
        },
        {
          section: 'BAKING CHOCOLATE',
          items: [
            { item: 'Callebaut Dark Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Callebaut Milk Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Callebaut White Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Valrhona Callets — Caraïbe 66% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Manjari 64% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Bahibé 46% (300g)', price: '$36.00' },
            { item: 'Valrhona Callets — Caramélia 36% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Ivoire 35% (300g)', price: '$29.00' },
            { item: 'Valrhona Cocoa Powder', price: '$19.50' },
          ],
        },
        {
          section: 'FROZEN',
          items: [
            { item: 'Duchess x RGE RD Tourtière (Frozen)', description: 'House-made French-Canadian meat pie, flaky crust, locally sourced meats', price: '$40.00' },
            { item: 'Frozen Pie Dough', description: '2 × 500g portions · yields one covered pie, two uncovered pies, or 24 small tarts', price: '$15.00' },
            { item: 'Frozen Sour Cherries (500g)', description: 'Tart cherries ideal for pies, compotes, and jams', price: '$13.75' },
            { item: 'Maple Butter', price: '$12.00' },
            { item: 'Provence Honey Butter', price: '$12.00' },
            { item: 'Duchess Ice Cream (1 Pint)', description: 'Vanilla Tonka Bean · Chocolate · Raspberry · Salted Caramel · Orange Basil Sorbetto' },
          ],
        },
        {
          section: 'BAKEWARE & TOOLS',
          items: [
            { item: 'Spatula — Offset 4.5"', price: '$7.00' },
            { item: 'Spatula — Offset 13"', price: '$12.00' },
            { item: 'Round Cake Pan (6")', price: '$19.00' },
            { item: 'Square Cake Pan (8")', price: '$33.00' },
            { item: 'Duchess Reusable Bag', price: '$2.00' },
            { item: 'Duchess Signature Navy Tote Bag', price: '$4.00' },
          ],
        },
      ],
    },
  ],

  'Little Duchess': [
    {
      label: 'BAKE SHOP',
      sections: [
        {
          section: 'MACARONS',
          items: [
            { item: 'Lemon Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Pistachio Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Rose Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Salted Caramel Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Vanilla Macaron', description: 'Delicate French almond flour meringue cookies sandwiched with rich house-made fillings', price: '$2.75' },
            { item: 'Cookies & Cream Macaron', description: 'Crisp vanilla shell filled with a smooth, creamy gluten-free cookie crumb buttercream · contains nuts', price: '$2.75' },
            { item: 'Amarena Cherry Macaron', description: 'Crisp, delicate shell with a luscious Amarena cherry-infused filling · contains nuts', price: '$2.75' },
            { item: 'Macaron Gift Box', price: '$24.00' },
          ],
        },
        {
          section: 'CAKES',
          items: [
            { item: 'Basque Cheesecake (Large)', description: 'Rich and creamy cheesecake with a light burn on top', price: '$60.00' },
            { item: 'Duchess Cake', description: 'Lemon chiffon cake, raspberry rose jam, vanilla pastry cream, whipped ganache, green marzipan · contains nuts', price: '$64.00' },
            { item: 'Duke Cake (Large)', description: 'Rich chocolate cake, salted caramel, Valrhona whipped chocolate ganache, mirror-finish chocolate glaçage', price: '$74.00' },
            { item: 'Duke Cake (Small)', description: 'Rich chocolate cake, salted caramel, Valrhona whipped chocolate ganache, mirror-finish chocolate glaçage', price: '$15.00' },
            { item: 'Gateau Juliette', description: 'Caramelized coconut base, coconut sponge, strawberry compote, raspberry mousse, coconut whipped ganache, vanilla white chocolate glaze · 6" only · contains gelatin', price: '$52.00' },
            { item: 'Lemon Meringue Cake (Large)', description: 'Lemon chiffon cake, salted caramel, lemon cream, toasted meringue', price: '$48.00' },
            { item: 'Lemon Marmalade Blueberry Coffee Cake', description: 'Blueberry lemon zest coffee cake, lemon marmalade glaze, vanilla crumb', price: '$7.50' },
          ],
        },
        {
          section: 'TARTS',
          items: [
            { item: 'Butter Tart', description: 'Flaky pastry with a gooey caramel filling and raisins', price: '$4.00' },
            { item: 'Mango Graham Tart (Small)', description: 'Graham-cashew crust, mango cream, yuzu gel, mango compote, vanilla bean whipped ganache', price: '$15.00' },
            { item: 'Tarte Aux Pêche', description: 'Pâte sucrée, vanilla financier, lavender-lemon poached peaches, peach-lavender glaze · contains nuts', price: '$7.50' },
            { item: 'Tart — Amélie (Large)', description: 'Vanilla tart shell, rhubarb cassis compote, sour cream mousse, rose Chantilly, buckwheat honey madeleine · contains gelatin, nuts', price: '$58.00' },
            { item: 'Tart — Amélie (Small)', description: 'Vanilla tart shell, rhubarb cassis compote, sour cream mousse, rose Chantilly, buckwheat honey madeleine · contains gelatin, nuts', price: '$14.00' },
            { item: 'Passion Fruit Raspberry Tartlette', description: 'Passion fruit whipped ganache, raspberry crémeux dome, almond tartlette shell · contains gelatin, nuts', price: '$6.00' },
          ],
        },
        {
          section: 'PIES',
          items: [
            { item: 'Banana Cream Pie (Large)', description: 'Flaky crust, vanilla bean pastry cream, fresh bananas, whipped cream', price: '$36.00' },
            { item: 'Banana Cream Pie (Small)', description: 'Flaky crust, vanilla bean pastry cream, fresh bananas, whipped cream', price: '$14.00' },
            { item: 'Rhubarb Galette', description: 'Rustic rhubarb tart with flaky pastry and sweet oat crumb', price: '$7.50' },
            { item: 'Sour Cream Cherry Pie (Large)', price: '$36.00' },
            { item: 'Sour Cream Cherry Pie (Small)', price: '$12.50' },
          ],
        },
        {
          section: 'COOKIES',
          items: [
            { item: 'Brownie', description: 'Triple chocolate and pecan, chocolate drizzle, chopped pecans, cocoa nibs · contains nuts', price: '$4.25' },
            { item: 'Mango Coconut Cookie', description: 'Dried mango, coconut, coconut shards, passion fruit chocolate', price: '$6.00' },
            { item: 'Oatmeal Milk Chocolate Cookie', description: 'Hearty oats, creamy milk chocolate, cinnamon', price: '$3.95' },
            { item: 'Yuzu Raspberry Caramel Shortbread', description: 'Classic Duchess shortbread, yuzu caramel, freeze dried raspberries', price: '$3.00' },
          ],
        },
        {
          section: 'MACARON GÂTEAU',
          items: [
            { item: 'Raspberry Peach Macaron Gâteau (Large)', description: 'Macaron shells, almond buttercream, raspberry whipped ganache, apricot curd, vanilla-sautéed peaches · contains gelatin, nuts', price: '$58.00' },
            { item: 'Raspberry Peach Macaron Gâteau (Small)', description: 'Macaron shells, almond buttercream, raspberry whipped ganache, apricot curd, vanilla-sautéed peaches · contains gelatin, nuts', price: '$14.00' },
          ],
        },
        {
          section: 'SCONES',
          items: [
            { item: 'Blueberry Lemon Scone', description: 'Juicy blueberries, lemon zest, lemon glaze', price: '$6.00' },
            { item: 'Cream Cheese & Everything Spice Scone', description: 'Cream cheese crumb, everything spice seasoning · contains sesame', price: '$6.00' },
          ],
        },
        {
          section: 'VIENNOISERIE',
          items: [
            { item: 'Classic Croissant', description: 'Traditional, made with 84% imported butter', price: '$5.00' },
            { item: 'Pain Au Chocolat', description: 'Valrhona milk and dark chocolate in traditional croissant dough', price: '$6.50' },
            { item: 'Gruyère Croissant', description: 'Traditional croissant filled and topped with Swiss gruyère', price: '$7.00' },
            { item: 'Brioche Pépin', description: 'Laminated brioche dough, vanilla bean pastry cream, Callebaut milk chocolate chips', price: '$7.00' },
            { item: 'Pistachio Rose Roulé', description: 'Croissant dough, pistachio and rose cream, pistachio praline ganache, honey rose glaze · contains nuts', price: '$7.00' },
            { item: 'Raspberry Chocolate Brioche', description: 'Pillowy brioche, chocolate orange pastry cream, raspberry compote, fresh raspberries', price: '$5.25' },
          ],
        },
        {
          section: 'OTHER BAKED GOODS',
          items: [
            { item: 'Coconut Lime Madeleine', description: 'Lime and coconut, coconut-lime glaze, toasted coconut, lime zest', price: '$3.00' },
            { item: 'Hummingbird Loaf', description: 'Banana, crushed pineapple, toasted pecans, cinnamon, vanilla bean cream cheese frosting · contains nuts', price: '$5.25' },
          ],
        },
      ],
    },
    {
      label: 'PROVISIONS',
      sections: [
        {
          section: 'PROVISIONS BY DUCHESS',
          items: [
            { item: 'Apple Earl Grey Jelly', price: '$16.00' },
            { item: 'Duchess x RGE RD Tourtière', price: '$40.00' },
            { item: 'Fruit Ketchup', price: '$14.00' },
            { item: 'Triple Chocolate Cookie Kit', description: 'Makes signature double chocolate cookies at home', price: '$26.00' },
            { item: 'Provence Tea Infused Honey (340g)', price: '$20.00' },
            { item: 'Raspberry Rose Jam', price: '$14.00' },
            { item: 'Salted Caramel (250ml)', price: '$14.00' },
            { item: 'Traditional Pancake Mix', price: '$17.25' },
            { item: 'Hot Chocolate Mix (170g)', description: 'Dark chocolate 67%, milk chocolate, cocoa powder, cardamom, allspice, nutmeg', price: '$24.00' },
          ],
        },
        {
          section: 'DUCHESS BLEND TEAS',
          items: [
            { item: 'Provence Tea (115g)', description: 'Ceylon blend with bergamot orange, lavender, and dried lavender buds', price: '$25.00' },
            { item: 'Paris Matin Tea', price: '$25.00' },
            { item: "L'Amour Tea", price: '$25.00' },
            { item: 'Kumaru Tea', price: '$25.00' },
            { item: 'Panache Tea', price: '$25.00' },
            { item: 'Seasonal Tea Trio', description: '15g per tin', price: '$30.00' },
          ],
        },
        {
          section: 'BAKING INGREDIENTS',
          items: [
            { item: 'All-Purpose Flour (5kg)', description: 'Unbleached bakery grade flour', price: '$24.00' },
            { item: 'Almond Flour (500g)', price: '$20.00' },
            { item: 'Bread Flour (5kg)', price: '$24.00' },
            { item: 'Amarena Cherries in Syrup (250ml)', price: '$16.00' },
            { item: 'Buttermilk Powder (300g)', price: '$12.00' },
            { item: 'Cocoa Powder (200g)', price: '$19.50' },
            { item: 'Crystallized Ginger (250g)', description: 'Ginger, cane sugar', price: '$18.00' },
            { item: 'Culinary Lavender (10g)', price: '$8.00' },
            { item: 'Dried Rose Petals (10g)', price: '$8.00' },
            { item: 'Egg Albumen (75g)', price: '$13.00' },
            { item: 'Feuilletine (200g)', price: '$18.00' },
            { item: 'Fleur de Sel (100g)', price: '$10.00' },
            { item: 'Gelatin Sheets (40g)', price: '$12.00' },
            { item: 'Pearl Sugar (300g)', price: '$14.50' },
            { item: 'Pistachio Extract (45ml)', price: '$34.00' },
            { item: 'Powder Food Colouring', description: 'Blue / Red / Yellow (7g each)', price: '$15.00 each' },
            { item: 'Tonka Beans (5 beans)', price: '$12.00' },
          ],
        },
        {
          section: 'BAKING CHOCOLATE',
          items: [
            { item: 'Callebaut Dark Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Callebaut Milk Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Callebaut White Chocolate Chips (300g)', price: '$17.00' },
            { item: 'Valrhona Callets — Bahibé 46% (300g)', price: '$36.00' },
            { item: 'Valrhona Callets — Caraïbe 66% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Caramélia 36% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Ivoire 35% (300g)', price: '$29.00' },
            { item: 'Valrhona Callets — Manjari 64% (300g)', price: '$29.00' },
          ],
        },
        {
          section: 'FROZEN',
          items: [
            { item: 'Frozen Pie Dough', price: '$15.00' },
            { item: 'Frozen Sour Cherries', price: '$13.75' },
            { item: 'Duchess x RGE RD Tourtière (Frozen)', price: '$40.00' },
            { item: 'Provence Honey Butter', price: '$12.00' },
            { item: 'Maple Butter', price: '$12.00' },
            { item: 'Duchess Ice Cream (1 Pint)', description: 'Vanilla Tonka Bean · Chocolate · Raspberry · Salted Caramel · Orange Basil Sorbetto' },
          ],
        },
        {
          section: 'HOMEWARE & DECORATIVE',
          items: [
            { item: 'Pastel Beeswax Birthday Candles', price: '$10.00' },
            { item: 'Duchess Vesper Candle', description: 'Wood wick vegan soy candle · orange, clove, vanilla, tonka bean, sandalwood, amber tobacco · hand-poured in Edmonton', price: '$65.00' },
          ],
        },
      ],
    },
  ],

  'Sunterra Market — Bankers Hall': SUNTERRA_DEPARTMENTS,
  'Sunterra Market — Britannia Plaza': SUNTERRA_DEPARTMENTS,
  'Sunterra Market — Kensington Road': SUNTERRA_DEPARTMENTS,
  'Sunterra Market — Keynote': SUNTERRA_DEPARTMENTS,
  'Sunterra Market — West Market Square': SUNTERRA_DEPARTMENTS,

  'Paper Birch Books': [
    {
      label: 'DRINKS',
      sections: [
        {
          section: 'COFFEE: THE STANDARDS',
          items: [
            { item: 'Drip' },
            { item: 'Espresso' },
            { item: 'Macchiato' },
            { item: 'Cortado' },
            { item: 'Cappuccino' },
            { item: 'Latte' },
            { item: 'Americano' },
          ],
        },
        {
          section: 'SEASONAL',
          items: [
            { item: 'Speculoos Latte' },
            { item: 'Maple Rooibos Tea Latte' },
          ],
        },
        {
          section: 'COFFEE + SOMETHING EXTRA',
          items: [
            { item: 'Vanilla Latte' },
            { item: 'Cardamom Latte' },
            { item: 'Mocha' },
          ],
        },
        {
          section: 'NOT COFFEE',
          items: [
            { item: 'Hot Chocolate' },
            { item: 'London Fog' },
            { item: 'Tea', description: 'Genmaicha · Milk Oolong · Jasmine · Cream of Earl Grey · Masala Chai · Lemon Rooibos · Berry Hibiscus · Mint Bliss · Butterfly Pea Flower · Gut Feeling · Immune Boost' },
          ],
        },
        {
          section: 'MICROGROUND TEA LATTES',
          items: [
            { item: 'Matcha' },
            { item: 'Hojicha' },
            { item: 'Rooibos' },
            { item: 'Turmeric' },
            { item: 'Masala Chai' },
          ],
        },
        {
          section: 'MILK',
          items: [
            { item: 'Oat Milk', description: 'No charge' },
            { item: 'Macadamia Nut Milk', price: '+$0.75' },
          ],
        },
      ],
    },
  ],

  'Base Salon + Supply': [
    {
      label: 'SERVICES',
      sections: [
        {
          section: 'CUTTING',
          items: [
            { item: 'Clipper Haircut', price: '$65+' },
            { item: 'Shears Haircut', price: '$85+' },
            { item: 'Children\'s Cut', description: 'Under 10 only', price: '$60+' },
          ],
        },
        {
          section: 'STYLING',
          items: [
            { item: 'Blowout', price: '$85+' },
            { item: 'Finishing Add On', description: 'With color service only', price: '$75+' },
            { item: 'Formal Styling', price: '$140+' },
            { item: 'Bridal', description: 'Consultation required', price: '$175+' },
          ],
        },
        {
          section: 'COLOR CLASSICS',
          items: [
            { item: 'Single Process Regrowth', price: '$135+' },
            { item: 'Single Process Full Color', price: '$165+' },
            { item: 'Classic Highlights', price: '$200+' },
            { item: 'Double Process Lightening', description: 'Consultation required', price: '$250+' },
            { item: 'Balayage and Hair Painting', price: '$250+' },
            { item: 'Toner and Gloss Add On', description: 'With another color service only', price: '$60+' },
          ],
        },
        {
          section: 'CUSTOM COLOR ACCENTING',
          note: 'Consultation required for all services',
          items: [
            { item: 'Salt and Pepper Embracing' },
            { item: 'Mini Refreshes / Partials / Color Blocking' },
            { item: 'Vivids' },
            { item: 'Color Corrections' },
          ],
        },
        {
          section: 'RETEXTURING',
          items: [
            { item: 'Body Waves + Perms', description: 'Consultation required', price: '$200+' },
            { item: 'Keratin Smoothing Treatment', description: 'Consultation required', price: '$500+' },
          ],
        },
      ],
    },
  ],

  'The Shala': [
    {
      label: 'PASSES',
      sections: [
        {
          section: 'INTRODUCTORY',
          items: [
            { item: 'New Student/Practitioner 1 Month Unlimited', price: '$79' },
            { item: 'New Student/Practitioner 3 Month Unlimited', price: '$210' },
            { item: 'New Student Mysore Package', description: 'Sliding scale pricing' },
          ],
        },
        {
          section: 'MONTHLY',
          items: [
            { item: '5 Classes / Month', price: '$75' },
            { item: 'Multiclass Bulk Pass', description: 'Minimum 6 classes', price: '$12 / class' },
            { item: 'Month Limited', description: 'Up to 12 classes', price: '$95' },
            { item: 'Led Class Month Unlimited', price: '$90' },
            { item: 'Monthly Unlimited', description: 'Auto-renewal', price: '$120' },
            { item: 'Month Unlimited', price: '$150' },
          ],
        },
        {
          section: 'ANNUAL & SEMI-ANNUAL',
          items: [
            { item: '6 Month Pass, Unlimited', description: 'Sliding scale' },
            { item: 'Annual Pass, Unlimited', description: 'Sliding scale' },
          ],
        },
      ],
    },
    {
      label: 'CLASSES',
      sections: [
        {
          section: 'SINGLE CLASSES',
          items: [
            { item: 'Led Class', price: '$20' },
            { item: 'Mysore', price: '$25' },
            { item: 'Sliding Scale', description: 'Per class / per month' },
          ],
        },
        {
          section: 'ONLINE',
          items: [
            { item: 'Drop-In Zoom', price: '$10' },
            { item: 'Remote Shala — 10 Classes / Month', price: '$75' },
            { item: 'Remote Shala Monthly Unlimited', description: 'Includes recorded classes', price: '$90' },
            { item: 'Remote Shala Monthly Unlimited', description: 'Sr / Student / Unemployed · Includes recorded classes', price: '$70' },
            { item: 'Remote Shala Monthly Unlimited', description: 'Sr / Student / Unemployed', price: '$50' },
          ],
        },
        {
          section: 'LIBRARY',
          items: [
            { item: 'Pre-Recorded Class', description: 'Sliding scale', price: '$1 / class' },
          ],
        },
      ],
    },
  ],
};

export const COLLECTION_LOCATIONS: CollectionLocation[] = [
  {
    id: 'atwater',
    name: 'Marché Atwater',
    detail: 'We are there every morning.',
  },
];

export const TIME_SLOTS: TimeSlot[] = [
  { time: '9:00', slots: 4 },
  { time: '10:00', slots: 3 },
  { time: '11:00', slots: 5 },
  { time: '12:00', slots: 2 },
  { time: '13:00', slots: 4 },
  { time: '14:00', slots: 3 },
  { time: '15:00', slots: 5 },
  { time: '16:00', slots: 3 },
  { time: '17:00', slots: 4 },
];

export function getDateOptions(): { label: string; dayNum: number; dayName: string; isoDate: string }[] {
  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const result = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    result.push({
      label: i === 0 ? 'TODAY' : days[d.getDay()],
      dayNum: d.getDate(),
      dayName: days[d.getDay()],
      isoDate: `${year}-${month}-${day}`,
    });
  }
  return result;
}
