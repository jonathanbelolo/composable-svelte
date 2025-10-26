import type { Product } from './product.js';

// ============================================================================
// Sample Product Data
// ============================================================================

export const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Wireless Headphones',
    price: 99.99,
    category: 'electronics',
    image: '🎧',
    description:
      'Premium wireless headphones with active noise cancellation and 30-hour battery life. Perfect for music lovers and professionals.',
    specs: {
      'Battery Life': '30 hours',
      Connectivity: 'Bluetooth 5.0',
      Weight: '250g',
      'Noise Cancellation': 'Active'
    },
    stock: 15,
    isFavorite: false
  },
  {
    id: 'prod-2',
    name: 'Running Shoes',
    price: 79.99,
    category: 'sports',
    image: '👟',
    description:
      'Lightweight running shoes engineered for optimal performance and comfort. Breathable mesh upper with responsive cushioning.',
    specs: {
      Material: 'Mesh fabric',
      Sole: 'Rubber',
      Weight: '200g per shoe',
      Sizes: '6-13'
    },
    stock: 42,
    isFavorite: true
  },
  {
    id: 'prod-3',
    name: 'Smart Watch',
    price: 249.99,
    category: 'electronics',
    image: '⌚',
    description:
      'Feature-rich smartwatch with health tracking, GPS, and 7-day battery life. Stay connected and healthy.',
    specs: {
      Display: '1.4" AMOLED',
      'Battery Life': '7 days',
      'Water Resistance': '50m',
      Sensors: 'Heart rate, GPS, SpO2'
    },
    stock: 8,
    isFavorite: true
  },
  {
    id: 'prod-4',
    name: 'Cotton T-Shirt',
    price: 24.99,
    category: 'clothing',
    image: '👕',
    description:
      '100% organic cotton t-shirt with comfortable fit. Available in multiple colors and sizes.',
    specs: {
      Material: '100% Organic Cotton',
      Fit: 'Regular',
      Care: 'Machine washable',
      Sizes: 'S-XXL'
    },
    stock: 127,
    isFavorite: false
  },
  {
    id: 'prod-5',
    name: 'Coffee Maker',
    price: 129.99,
    category: 'home',
    image: '☕',
    description:
      'Programmable drip coffee maker with thermal carafe. Brew the perfect cup every morning.',
    specs: {
      Capacity: '12 cups',
      Features: 'Programmable, auto-shutoff',
      Carafe: 'Thermal stainless steel',
      Power: '900W'
    },
    stock: 23,
    isFavorite: false
  },
  {
    id: 'prod-6',
    name: 'Yoga Mat',
    price: 34.99,
    category: 'sports',
    image: '🧘',
    description:
      'Premium non-slip yoga mat with excellent cushioning. Perfect for yoga, pilates, and stretching.',
    specs: {
      Dimensions: '72" x 24"',
      Thickness: '6mm',
      Material: 'TPE foam',
      'Anti-slip': 'Yes'
    },
    stock: 56,
    isFavorite: false
  },
  {
    id: 'prod-7',
    name: 'Laptop Backpack',
    price: 59.99,
    category: 'electronics',
    image: '🎒',
    description:
      'Durable laptop backpack with multiple compartments and USB charging port. Fits up to 15.6" laptops.',
    specs: {
      'Laptop Size': 'Up to 15.6"',
      Material: 'Water-resistant nylon',
      Features: 'USB port, multiple pockets',
      Dimensions: '18" x 12" x 7"'
    },
    stock: 34,
    isFavorite: true
  },
  {
    id: 'prod-8',
    name: 'Denim Jeans',
    price: 69.99,
    category: 'clothing',
    image: '👖',
    description: 'Classic denim jeans with modern fit. Durable and comfortable for everyday wear.',
    specs: {
      Material: '98% Cotton, 2% Elastane',
      Fit: 'Slim',
      Wash: 'Dark blue',
      Sizes: '28-40'
    },
    stock: 0,
    isFavorite: false
  },
  {
    id: 'prod-9',
    name: 'Table Lamp',
    price: 44.99,
    category: 'home',
    image: '💡',
    description: 'Modern LED table lamp with adjustable brightness and color temperature. Energy efficient.',
    specs: {
      'Light Source': 'LED',
      Brightness: '3 levels',
      'Color Temperature': '3000K-6000K',
      Power: '12W'
    },
    stock: 18,
    isFavorite: false
  },
  {
    id: 'prod-10',
    name: 'Bluetooth Speaker',
    price: 54.99,
    category: 'electronics',
    image: '🔊',
    description:
      'Portable Bluetooth speaker with 360° sound and waterproof design. Perfect for outdoor adventures.',
    specs: {
      'Battery Life': '12 hours',
      'Water Resistance': 'IPX7',
      Connectivity: 'Bluetooth 5.0',
      Power: '20W'
    },
    stock: 29,
    isFavorite: false
  },
  {
    id: 'prod-11',
    name: 'Winter Jacket',
    price: 149.99,
    category: 'clothing',
    image: '🧥',
    description:
      'Insulated winter jacket with waterproof shell. Stay warm and dry in cold weather.',
    specs: {
      Insulation: 'Synthetic down',
      Shell: 'Waterproof nylon',
      Features: 'Hood, multiple pockets',
      Sizes: 'S-XXL'
    },
    stock: 12,
    isFavorite: false
  },
  {
    id: 'prod-12',
    name: 'Tennis Racket',
    price: 89.99,
    category: 'sports',
    image: '🎾',
    description:
      'Professional-grade tennis racket with graphite frame. Perfect for intermediate to advanced players.',
    specs: {
      Material: 'Graphite composite',
      Weight: '300g',
      'Head Size': '100 sq in',
      'Grip Size': '4 1/4'
    },
    stock: 7,
    isFavorite: true
  }
];
