/**
 * Tests for ICU MessageFormat integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isICUMessage,
  compileICU,
  clearICUCache,
  getICUCacheStats,
  ICUPatterns
} from '../../src/lib/i18n/icu.js';

describe('isICUMessage', () => {
  it('should detect plural syntax', () => {
    expect(isICUMessage('{count, plural, one {# item} other {# items}}')).toBe(true);
  });

  it('should detect select syntax', () => {
    expect(isICUMessage('{gender, select, male {he} female {she} other {they}}')).toBe(true);
  });

  it('should detect selectordinal syntax', () => {
    expect(isICUMessage('{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}')).toBe(true);
  });

  it('should detect number formatting', () => {
    expect(isICUMessage('{price, number, ::currency/USD}')).toBe(true);
  });

  it('should detect date formatting', () => {
    expect(isICUMessage('{date, date, short}')).toBe(true);
  });

  it('should detect time formatting', () => {
    expect(isICUMessage('{time, time, short}')).toBe(true);
  });

  it('should NOT detect simple interpolation', () => {
    expect(isICUMessage('Hello {name}')).toBe(false);
    expect(isICUMessage('Welcome, {user}!')).toBe(false);
  });

  it('should handle whitespace variations', () => {
    expect(isICUMessage('{count,plural,one{#}other{#}}')).toBe(true);
    expect(isICUMessage('{ count , plural , one {#} other {#} }')).toBe(true);
  });
});

describe('compileICU', () => {
  afterEach(() => {
    clearICUCache();
  });

  describe('Pluralization', () => {
    it('should format simple English plural (one)', () => {
      const format = compileICU('{count, plural, one {# item} other {# items}}', 'en');
      expect(format({ count: 1 })).toBe('1 item');
    });

    it('should format simple English plural (other)', () => {
      const format = compileICU('{count, plural, one {# item} other {# items}}', 'en');
      expect(format({ count: 0 })).toBe('0 items');
      expect(format({ count: 2 })).toBe('2 items');
      expect(format({ count: 5 })).toBe('5 items');
    });

    it('should format complex plural with text', () => {
      const format = compileICU('You have {count, plural, one {# item} other {# items}} in your cart', 'en');
      expect(format({ count: 1 })).toBe('You have 1 item in your cart');
      expect(format({ count: 3 })).toBe('You have 3 items in your cart');
    });

    it('should handle zero with explicit case', () => {
      const format = compileICU('{count, plural, =0 {No items} one {# item} other {# items}}', 'en');
      expect(format({ count: 0 })).toBe('No items');
      expect(format({ count: 1 })).toBe('1 item');
      expect(format({ count: 2 })).toBe('2 items');
    });

    it('should format Polish plural (one, few, many)', () => {
      const format = compileICU(
        '{count, plural, one {# przedmiot} few {# przedmioty} many {# przedmiotów} other {# przedmiotów}}',
        'pl'
      );
      expect(format({ count: 1 })).toBe('1 przedmiot');
      expect(format({ count: 2 })).toBe('2 przedmioty');
      expect(format({ count: 5 })).toBe('5 przedmiotów');
    });

    it('should format Arabic plural (6 forms)', () => {
      const format = compileICU(
        '{count, plural, =0 {لا عناصر} one {عنصر واحد} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}',
        'ar'
      );
      expect(format({ count: 0 })).toBe('لا عناصر');
      expect(format({ count: 1 })).toBe('عنصر واحد');
      expect(format({ count: 2 })).toBe('عنصران');
      expect(format({ count: 3 })).toBe('3 عناصر');
      expect(format({ count: 11 })).toBe('11 عنصرًا');
      expect(format({ count: 100 })).toBe('100 عنصر');
    });
  });

  describe('Gender Selection', () => {
    it('should select based on gender', () => {
      const format = compileICU('{gender, select, male {He is} female {She is} other {They are}} online', 'en');
      expect(format({ gender: 'male' })).toBe('He is online');
      expect(format({ gender: 'female' })).toBe('She is online');
      expect(format({ gender: 'nonbinary' })).toBe('They are online');
    });

    it('should handle missing gender gracefully', () => {
      const format = compileICU('{gender, select, male {He} female {She} other {They}}', 'en');
      expect(format({ gender: undefined })).toBe('They');
    });
  });

  describe('Ordinal Selection', () => {
    it('should format ordinal numbers in English', () => {
      const format = compileICU('You finished {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}', 'en');
      expect(format({ place: 1 })).toBe('You finished 1st');
      expect(format({ place: 2 })).toBe('You finished 2nd');
      expect(format({ place: 3 })).toBe('You finished 3rd');
      expect(format({ place: 4 })).toBe('You finished 4th');
      expect(format({ place: 21 })).toBe('You finished 21st');
      expect(format({ place: 22 })).toBe('You finished 22nd');
    });
  });

  describe('Number Formatting', () => {
    it('should format currency', () => {
      const format = compileICU('Price: {price, number, ::currency/USD}', 'en-US');
      const result = format({ price: 1234.56 });
      expect(result).toContain('1,234.56');
      expect(result).toContain('$');
    });

    it('should format percent', () => {
      const format = compileICU('Discount: {discount, number, ::percent}', 'en');
      const result = format({ discount: 0.15 });
      expect(result).toContain('15');
      expect(result).toContain('%');
    });

    it('should format plain numbers', () => {
      const format = compileICU('Total: {total, number}', 'en');
      const result = format({ total: 1000 });
      expect(result).toContain('1,000');
    });
  });

  describe('Date/Time Formatting', () => {
    const testDate = new Date('2024-01-15T14:30:00Z');

    it('should format dates', () => {
      const format = compileICU('Date: {date, date, short}', 'en-US');
      const result = format({ date: testDate });
      expect(result).toContain('Date:');
      expect(result).toMatch(/\d{1,2}\/\d{1,2}\/\d{2,4}/);
    });

    it('should format times', () => {
      const format = compileICU('Time: {time, time, short}', 'en-US');
      const result = format({ time: testDate });
      expect(result).toContain('Time:');
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });
  });

  describe('Nested Patterns', () => {
    it('should handle nested gender + plural', () => {
      const format = compileICU(
        '{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}} other {{count, plural, one {They have # item} other {They have # items}}}}',
        'en'
      );
      expect(format({ gender: 'male', count: 1 })).toBe('He has 1 item');
      expect(format({ gender: 'male', count: 5 })).toBe('He has 5 items');
      expect(format({ gender: 'female', count: 1 })).toBe('She has 1 item');
      expect(format({ gender: 'female', count: 5 })).toBe('She has 5 items');
    });
  });

  describe('Caching', () => {
    it('should cache compiled messages', () => {
      const message = '{count, plural, one {# item} other {# items}}';

      clearICUCache();
      expect(getICUCacheStats().size).toBe(0);

      compileICU(message, 'en');
      expect(getICUCacheStats().size).toBe(1);

      // Calling again should use cache
      compileICU(message, 'en');
      expect(getICUCacheStats().size).toBe(1);
    });

    it('should cache separately per locale', () => {
      const message = '{count, plural, one {# item} other {# items}}';

      clearICUCache();
      compileICU(message, 'en');
      compileICU(message, 'pt-BR');

      expect(getICUCacheStats().size).toBe(2);
    });

    it('should clear cache', () => {
      compileICU('{count, plural, one {#} other {#}}', 'en');
      compileICU('{count, plural, one {#} other {#}}', 'pt-BR');

      expect(getICUCacheStats().size).toBeGreaterThan(0);

      clearICUCache();
      expect(getICUCacheStats().size).toBe(0);
    });

    it('should clear cache for specific locale', () => {
      compileICU('{count, plural, one {#} other {#}}', 'en');
      compileICU('{count, plural, one {#} other {#}}', 'pt-BR');
      compileICU('{count, plural, one {#} other {#}}', 'es');

      const initialSize = getICUCacheStats().size;
      expect(initialSize).toBe(3);

      clearICUCache('en');
      expect(getICUCacheStats().size).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid ICU syntax gracefully', () => {
      const format = compileICU('{count, plural, one {# item}', 'en'); // Missing closing brace
      expect(format({ count: 1 })).toBe('{count, plural, one {# item}'); // Returns original message
    });

    it('should handle missing parameters', () => {
      const format = compileICU('{count, plural, one {# item} other {# items}}', 'en');
      const result = format({});
      expect(result).toBeTruthy(); // Should not crash
    });

    it('should handle formatting errors gracefully', () => {
      const format = compileICU('{price, number, ::currency/USD}', 'en-US');
      const result = format({ price: 'not-a-number' });
      expect(result).toBeTruthy(); // Should not crash
    });
  });

  describe('ICUPatterns Examples', () => {
    it('should provide working pattern examples', () => {
      // Simple plural
      const simplePlural = compileICU(ICUPatterns.simplePlural, 'en');
      expect(simplePlural({ count: 1 })).toBe('1 item');
      expect(simplePlural({ count: 2 })).toBe('2 items');

      // Gender select
      const genderSelect = compileICU(ICUPatterns.genderSelect, 'en');
      expect(genderSelect({ gender: 'male' })).toBe('he');
      expect(genderSelect({ gender: 'female' })).toBe('she');
    });
  });
});
