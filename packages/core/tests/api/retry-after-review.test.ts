import {it,expect,vi,afterEach} from 'vitest';
import {parseRetryAfter} from '../../src/lib/api/retry.js';
afterEach(()=>vi.useRealTimers());
function at(value='2026-09-18T12:00:00Z'){vi.useFakeTimers();vi.setSystemTime(new Date(value));}
it.each(['Retry-after','RETRY-AFTER','rEtRy-AfTeR'])('accepts case-insensitive header %s',key=>{expect(parseRetryAfter({[key]:'60'})).toBe(60000);});
it.each(['Friday, 18-Sep-26 12:01:00 GMT','Fri Sep 18 12:01:00 2026','Fri, 18 Sep 2026 12:01:00 GMT','2026-09-18T14:01:00+02:00','2026-09-18T12:01:00.000Z'])('accepts supported date %s',value=>{at();expect(parseRetryAfter({'retry-after':value})).toBe(60000);});
it.each(['September 18, 2026 12:01:00 GMT','Feb 31 2027 GMT','Wed, 31 Feb 2027 12:00:00 GMT','2027-02-31T12:00:00Z','2027-02-31','18-Sep-2026 12:01:00 GMT','Fri, 18 Sep 2026 25:00:00 GMT','2026-09-18T12:01:00Z junk'])('rejects invalid or unrecognized date %s',value=>{at();expect(parseRetryAfter({'retry-after':value})).toBeNull();});
it('accepts leap dates and ISO date-only compatibility',()=>{at('2028-02-28T00:00:00Z');expect(parseRetryAfter({'retry-after':'2028-02-29'})).toBe(86400000);expect(parseRetryAfter({'retry-after':'Tue, 29 Feb 2028 00:00:00 GMT'})).toBe(86400000);});
it('resolves obsolete two-digit years using the rolling fifty-year rule',()=>{at('2026-09-18T12:00:00Z');expect(parseRetryAfter({'retry-after':'Wednesday, 18-Sep-75 12:00:00 GMT'})).toBe(Date.parse('2075-09-18T12:00:00Z')-Date.now());expect(parseRetryAfter({'retry-after':'Friday, 18-Sep-76 12:00:01 GMT'})).toBeNull();expect(parseRetryAfter({'retry-after':'Friday, 18-Sep-76 12:00:00 GMT'})).toBe(Date.parse('2076-09-18T12:00:00Z')-Date.now());});
it('parses the space-padded asctime day as UTC',()=>{at('2026-09-08T12:00:00Z');expect(parseRetryAfter({'retry-after':'Tue Sep  8 12:01:00 2026'})).toBe(60000);});
it.each(['2026-09-18T12:01:00+24:00','2026-09-18T12:01:00+02:99','Fri, 18 Xxx 2026 12:01:00 GMT','2026-09-18T12:01:00'])('rejects unsupported or invalid timezone/calendar %s',value=>{at();expect(parseRetryAfter({'retry-after':value})).toBeNull();});

it.each(['Sat, 31 Dec 2016 23:59:60 GMT','Saturday, 31-Dec-16 23:59:60 GMT','Sat Dec 31 23:59:60 2016'])('normalizes HTTP leap second %s to the next representable instant',value=>{at('2016-12-31T23:59:59Z');expect(parseRetryAfter({'retry-after':value})).toBe(1000);});
it('keeps ISO extension seconds strict and rejects HTTP seconds above60',()=>{at('2016-12-31T23:59:59Z');expect(parseRetryAfter({'retry-after':'2016-12-31T23:59:60Z'})).toBeNull();expect(parseRetryAfter({'retry-after':'Sat, 31 Dec 2016 23:59:61 GMT'})).toBeNull();});
it('uses the same rolling window across century rollover',()=>{at('2090-01-01T00:00:00Z');expect(parseRetryAfter({'retry-after':'Wednesday, 01-Jan-10 00:00:00 GMT'})).toBe(Date.parse('2110-01-01T00:00:00Z')-Date.now());expect(parseRetryAfter({'retry-after':'Sunday, 01-Jan-41 00:00:00 GMT'})).toBeNull();});
