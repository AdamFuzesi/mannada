// Timezone Handling Utilities
// Provides comprehensive timezone conversion and parsing

import * as moment from 'moment-timezone';

export class TimezoneHandler {
  constructor() {
    this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  // Parse timezone from text
  parseTimezoneFromText(text) {
    const timezonePatterns = [
      // Explicit timezone mentions
      { pattern: /\b(EST|EDT|Eastern)\b/i, timezone: 'America/New_York' },
      { pattern: /\b(CST|CDT|Central)\b/i, timezone: 'America/Chicago' },
      { pattern: /\b(MST|MDT|Mountain)\b/i, timezone: 'America/Denver' },
      { pattern: /\b(PST|PDT|Pacific)\b/i, timezone: 'America/Los_Angeles' },
      { pattern: /\b(GMT|UTC)\b/i, timezone: 'Europe/London' },
      { pattern: /\b(BST|London)\b/i, timezone: 'Europe/London' },
      { pattern: /\b(CET|Paris|Berlin)\b/i, timezone: 'Europe/Paris' },
      { pattern: /\b(IST|India)\b/i, timezone: 'Asia/Kolkata' },
      { pattern: /\b(JST|Japan|Tokyo)\b/i, timezone: 'Asia/Tokyo' },
      { pattern: /\b(AEST|Sydney|Australia)\b/i, timezone: 'Australia/Sydney' },
      
      // Location-based
      { pattern: /\bNew York\b/i, timezone: 'America/New_York' },
      { pattern: /\bChicago\b/i, timezone: 'America/Chicago' },
      { pattern: /\bLos Angeles|LA\b/i, timezone: 'America/Los_Angeles' },
      { pattern: /\bSan Francisco|SF\b/i, timezone: 'America/Los_Angeles' },
      { pattern: /\bSeattle\b/i, timezone: 'America/Los_Angeles' },
      { pattern: /\bDenver\b/i, timezone: 'America/Denver' },
      { pattern: /\bLondon\b/i, timezone: 'Europe/London' },
      { pattern: /\bParis\b/i, timezone: 'Europe/Paris' },
      { pattern: /\bBerlin\b/i, timezone: 'Europe/Berlin' },
      { pattern: /\bDubai\b/i, timezone: 'Asia/Dubai' },
      { pattern: /\bSingapore\b/i, timezone: 'Asia/Singapore' },
      { pattern: /\bHong Kong\b/i, timezone: 'Asia/Hong_Kong' },
      { pattern: /\bTokyo\b/i, timezone: 'Asia/Tokyo' },
      { pattern: /\bSydney\b/i, timezone: 'Australia/Sydney' }
    ];

    for (const { pattern, timezone } of timezonePatterns) {
      if (pattern.test(text)) {
        return timezone;
      }
    }

    return null;
  }

  // Convert time between timezones
  convertTime(dateTime, fromTimezone, toTimezone) {
    const momentObj = moment.tz(dateTime, fromTimezone);
    return momentObj.tz(toTimezone);
  }

  // Format time with timezone
  formatWithTimezone(dateTime, timezone) {
    const m = moment.tz(dateTime, timezone);
    return {
      date: m.format('YYYY-MM-DD'),
      time: m.format('HH:mm'),
      dateFormatted: m.format('dddd, MMMM D, YYYY'),
      timeFormatted: m.format('h:mm A'),
      timezone: timezone,
      tzAbbr: m.format('z'),
      utcOffset: m.format('Z')
    };
  }

  // Parse relative time references
  parseRelativeTime(text, referenceDate = new Date()) {
    const lowerText = text.toLowerCase();
    const now = moment(referenceDate);

    // Today/tomorrow/yesterday
    if (/\btoday\b/.test(lowerText)) {
      return now.toDate();
    }
    if (/\btomorrow\b/.test(lowerText)) {
      return now.add(1, 'day').toDate();
    }
    if (/\byesterday\b/.test(lowerText)) {
      return now.subtract(1, 'day').toDate();
    }

    // Next/this week
    if (/\bnext week\b/.test(lowerText)) {
      return now.add(1, 'week').startOf('week').toDate();
    }
    if (/\bthis week\b/.test(lowerText)) {
      return now.startOf('week').toDate();
    }

    // Specific days of week
    const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const dayPattern = new RegExp(`\\b(next|this)\\s+(${daysOfWeek.join('|')})\\b`, 'i');
    const dayMatch = lowerText.match(dayPattern);
    
    if (dayMatch) {
      const modifier = dayMatch[1].toLowerCase();
      const dayName = dayMatch[2].toLowerCase();
      const targetDay = daysOfWeek.indexOf(dayName);
      
      let targetDate = now.clone().day(targetDay);
      
      // If the day has passed this week and we say "next", go to next week
      if (modifier === 'next' || targetDate.isBefore(now, 'day')) {
        targetDate.add(1, 'week');
      }
      
      return targetDate.toDate();
    }

    // In X days/weeks
    const inPattern = /\bin\s+(\d+)\s+(day|days|week|weeks|month|months)\b/i;
    const inMatch = lowerText.match(inPattern);
    
    if (inMatch) {
      const amount = parseInt(inMatch[1]);
      const unit = inMatch[2].replace(/s$/, ''); // Remove plural 's'
      return now.add(amount, unit).toDate();
    }

    return null;
  }

  // Detect if time reference is "my time" or "your time"
  detectTimeReference(text) {
    const lowerText = text.toLowerCase();
    
    if (/\bmy time\b/.test(lowerText)) {
      return 'sender';
    }
    if (/\byour time\b/.test(lowerText)) {
      return 'recipient';
    }
    
    return 'sender'; // Default assumption
  }

  // Calculate time difference between timezones
  getTimeDifference(timezone1, timezone2) {
    const now = moment();
    const tz1Offset = moment.tz(now, timezone1).utcOffset();
    const tz2Offset = moment.tz(now, timezone2).utcOffset();
    
    const diffMinutes = tz2Offset - tz1Offset;
    const hours = Math.floor(Math.abs(diffMinutes) / 60);
    const minutes = Math.abs(diffMinutes) % 60;
    
    return {
      hours,
      minutes,
      totalMinutes: diffMinutes,
      formatted: `${diffMinutes >= 0 ? '+' : '-'}${hours}:${String(minutes).padStart(2, '0')}`
    };
  }

  // Check if DST is active
  isDSTActive(timezone, date = new Date()) {
    const m = moment.tz(date, timezone);
    return m.isDST();
  }

  // Get timezone display name
  getTimezoneDisplayName(timezone) {
    const m = moment.tz(timezone);
    const abbr = m.format('z');
    const offset = m.format('Z');
    
    return `${timezone} (${abbr} ${offset})`;
  }

  // Suggest meeting times based on both timezones
  suggestMeetingTimes(timezone1, timezone2, options = {}) {
    const {
      date = new Date(),
      duration = 30,
      businessHoursStart = 9,
      businessHoursEnd = 17
    } = options;

    const suggestions = [];
    const startDate = moment(date).startOf('day');

    // Try each hour in timezone1's business hours
    for (let hour = businessHoursStart; hour < businessHoursEnd; hour++) {
      const time1 = startDate.clone().tz(timezone1).hour(hour).minute(0);
      const time2 = time1.clone().tz(timezone2);

      // Check if it's also in business hours for timezone2
      const hour2 = time2.hour();
      if (hour2 >= businessHoursStart && hour2 < businessHoursEnd) {
        suggestions.push({
          timezone1Time: time1.format('h:mm A'),
          timezone2Time: time2.format('h:mm A'),
          dateTime: time1.toISOString(),
          score: this.calculateTimeScore(hour, hour2)
        });
      }
    }

    // Sort by score (prefer mid-day times)
    suggestions.sort((a, b) => b.score - a.score);

    return suggestions.slice(0, 5); // Return top 5
  }

  calculateTimeScore(hour1, hour2) {
    // Prefer times between 10 AM - 4 PM for both parties
    const idealStart = 10;
    const idealEnd = 16;
    
    const score1 = hour1 >= idealStart && hour1 <= idealEnd ? 1 : 0.5;
    const score2 = hour2 >= idealStart && hour2 <= idealEnd ? 1 : 0.5;
    
    // Avoid early morning and late afternoon
    const earlyPenalty1 = hour1 < 9 ? -0.5 : 0;
    const earlyPenalty2 = hour2 < 9 ? -0.5 : 0;
    const latePenalty1 = hour1 > 17 ? -0.5 : 0;
    const latePenalty2 = hour2 > 17 ? -0.5 : 0;
    
    return score1 + score2 + earlyPenalty1 + earlyPenalty2 + latePenalty1 + latePenalty2;
  }

  // Format time range in both timezones
  formatTimeRange(startTime, duration, timezone1, timezone2) {
    const start1 = moment.tz(startTime, timezone1);
    const end1 = start1.clone().add(duration, 'minutes');
    
    const start2 = start1.clone().tz(timezone2);
    const end2 = end1.clone().tz(timezone2);

    return {
      timezone1: {
        start: start1.format('h:mm A'),
        end: end1.format('h:mm A'),
        date: start1.format('dddd, MMMM D, YYYY'),
        timezone: timezone1,
        tzAbbr: start1.format('z')
      },
      timezone2: {
        start: start2.format('h:mm A'),
        end: end2.format('h:mm A'),
        date: start2.format('dddd, MMMM D, YYYY'),
        timezone: timezone2,
        tzAbbr: start2.format('z')
      }
    };
  }

  // Check if same calendar day in different timezones
  isSameDay(dateTime, timezone1, timezone2) {
    const m1 = moment.tz(dateTime, timezone1);
    const m2 = moment.tz(dateTime, timezone2);
    
    return m1.format('YYYY-MM-DD') === m2.format('YYYY-MM-DD');
  }

  // Get user's timezone
  getUserTimezone() {
    return this.userTimezone;
  }

  // Set user's timezone
  setUserTimezone(timezone) {
    this.userTimezone = timezone;
  }
}

export default new TimezoneHandler();

