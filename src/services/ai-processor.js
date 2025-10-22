// AI Processor Service
// Handles natural language processing for meeting scheduling

import * as chrono from 'chrono-node';

export class AIProcessor {
  constructor() {
    this.apiKey = null;
    this.apiEndpoint = 'https://api.openai.com/v1/chat/completions';
    this.loadApiKey();
  }

  async loadApiKey() {
    try {
      const result = await chrome.storage.sync.get(['openaiApiKey']);
      this.apiKey = result.openaiApiKey;
    } catch (error) {
      console.error('Error loading API key:', error);
    }
  }

  async parseSchedulingRequest(command, context) {
    try {
      // First, try local parsing for speed
      const localParse = this.localParse(command, context);
      
      // If API key is available, enhance with AI
      if (this.apiKey) {
        return await this.aiEnhancedParse(command, context, localParse);
      }
      
      return localParse;
    } catch (error) {
      console.error('Error parsing scheduling request:', error);
      return null;
    }
  }

  localParse(command, context) {
    const parsed = {
      participantName: null,
      email: null,
      date: null,
      time: null,
      timezone: null,
      duration: null,
      platform: null
    };

    // Extract participant from context
    if (context?.participantInfo?.name) {
      parsed.participantName = context.participantInfo.name;
    }

    if (context?.participantInfo?.email) {
      parsed.email = context.participantInfo.email;
    }

    // Parse dates and times using chrono-node
    const chronoParsed = chrono.parse(command);
    if (chronoParsed.length > 0) {
      const firstDate = chronoParsed[0].start;
      const date = firstDate.date();
      
      parsed.date = date.toISOString().split('T')[0];
      
      if (firstDate.isCertain('hour')) {
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        parsed.time = `${hours}:${minutes}`;
      }
    }

    // Extract duration
    const durationPatterns = [
      /(\d+)\s*(?:minute|min|minutes)/i,
      /(\d+)\s*(?:hour|hr|hours)/i,
      /(\d+\.5)\s*(?:hour|hr|hours)/i
    ];

    for (const pattern of durationPatterns) {
      const match = command.match(pattern);
      if (match) {
        let duration = parseFloat(match[1]);
        if (pattern.toString().includes('hour')) {
          duration *= 60;
        }
        parsed.duration = duration;
        break;
      }
    }

    // Extract platform
    const platformKeywords = {
      'google-meet': ['google meet', 'gmeet', 'meet'],
      'zoom': ['zoom'],
      'teams': ['teams', 'microsoft teams', 'ms teams']
    };

    const lowerCommand = command.toLowerCase();
    for (const [platform, keywords] of Object.entries(platformKeywords)) {
      if (keywords.some(keyword => lowerCommand.includes(keyword))) {
        parsed.platform = platform;
        break;
      }
    }

    // Extract timezone from command or context
    const timezoneMatch = command.match(/\b([A-Z]{3,4})\b/); // EST, PST, GMT, etc.
    if (timezoneMatch) {
      parsed.timezone = this.convertTimezoneAbbreviation(timezoneMatch[1]);
    }

    return parsed;
  }

  async aiEnhancedParse(command, context, localParse) {
    try {
      const prompt = this.buildPrompt(command, context, localParse);
      
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a meeting scheduling assistant. Parse natural language commands and extract meeting details. Return valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        console.error('AI API error:', response.status);
        return localParse;
      }

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Parse JSON response
      const aiParsed = JSON.parse(content);
      
      // Merge with local parse, preferring AI results
      return {
        ...localParse,
        ...aiParsed,
        // Keep local parse if AI didn't provide value
        participantName: aiParsed.participantName || localParse.participantName,
        email: aiParsed.email || localParse.email
      };

    } catch (error) {
      console.error('Error with AI parsing:', error);
      return localParse;
    }
  }

  buildPrompt(command, context, localParse) {
    const contextInfo = {
      participantName: context?.participantInfo?.name,
      participantEmail: context?.participantInfo?.email,
      participantJob: context?.participantInfo?.jobInfo,
      recentMessages: context?.messages?.slice(-5).map(m => 
        `${m.sender}: ${m.content}`
      ).join('\n')
    };

    return `
Voice Command: "${command}"

LinkedIn Chat Context:
- Participant: ${contextInfo.participantName || 'Unknown'}
- Email: ${contextInfo.participantEmail || 'Not found'}
- Job: ${contextInfo.participantJob || 'Not provided'}

Recent Chat Messages:
${contextInfo.recentMessages || 'No messages'}

Local Parse Results (use as hints):
${JSON.stringify(localParse, null, 2)}

Please extract and return a JSON object with:
{
  "participantName": "string (from context or command)",
  "email": "string (from context or command)",
  "date": "YYYY-MM-DD format",
  "time": "HH:MM format (24-hour)",
  "timezone": "IANA timezone (e.g., America/New_York)",
  "duration": number (in minutes),
  "platform": "google-meet|zoom|teams",
  "confidence": number (0-1),
  "inferredInfo": ["list of fields that were inferred vs explicit"]
}

If the chat messages mention specific times, dates, or preferences, use that information.
If timezone is mentioned in chat (e.g., "I'm in PST" or "London time"), extract it.
Default duration to 30 if not specified.
Return ONLY valid JSON, no explanation.
    `;
  }

  async generateMeetingMessage(details) {
    try {
      // If API key available, use AI for better personalization
      if (this.apiKey) {
        return await this.aiGenerateMessage(details);
      }
      
      // Otherwise use template
      return this.templateMessage(details);
    } catch (error) {
      console.error('Error generating message:', error);
      return this.templateMessage(details);
    }
  }

  async aiGenerateMessage(details) {
    try {
      const prompt = `
Generate a professional meeting invitation message for LinkedIn with these details:

Participant: ${details.participantName}
Date: ${details.date}
Time: ${details.time}
Timezone: ${details.timezone}
Duration: ${details.duration} minutes
Platform: ${details.platform}

Recent chat context:
${details.context?.slice(-3).map(m => `${m.sender}: ${m.content}`).join('\n') || 'No context'}

Requirements:
- Professional but friendly tone
- Acknowledge any context from chat
- Include all meeting details clearly
- Add emoji for visual appeal (calendar, clock, link icons)
- Keep it concise (3-4 sentences)
- Use placeholder [Meeting Link] for the actual link

Generate the message:
      `;

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a professional meeting coordinator. Write clear, friendly meeting invitations.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 300
        })
      });

      if (!response.ok) {
        return this.templateMessage(details);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();

    } catch (error) {
      console.error('Error with AI message generation:', error);
      return this.templateMessage(details);
    }
  }

  templateMessage(details) {
    const platformNames = {
      'google-meet': 'Google Meet',
      'zoom': 'Zoom',
      'teams': 'Microsoft Teams'
    };

    return `Hi ${details.participantName || 'there'},

Looking forward to our discussion! I've scheduled a ${platformNames[details.platform] || 'video call'} for:

📅 ${details.date}
🕐 ${details.time} ${details.timezone}
⏱️ ${details.duration} minutes
🔗 [Meeting Link]

Calendar invite sent. Let me know if you need to reschedule!

Best regards`;
  }

  convertTimezoneAbbreviation(abbr) {
    const timezoneMap = {
      'EST': 'America/New_York',
      'EDT': 'America/New_York',
      'CST': 'America/Chicago',
      'CDT': 'America/Chicago',
      'MST': 'America/Denver',
      'MDT': 'America/Denver',
      'PST': 'America/Los_Angeles',
      'PDT': 'America/Los_Angeles',
      'GMT': 'Europe/London',
      'BST': 'Europe/London',
      'CET': 'Europe/Paris',
      'CEST': 'Europe/Paris',
      'IST': 'Asia/Kolkata',
      'JST': 'Asia/Tokyo',
      'AEST': 'Australia/Sydney',
      'AEDT': 'Australia/Sydney'
    };

    return timezoneMap[abbr] || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  async analyzeChatForSchedulingContext(messages) {
    // Analyze chat messages for implicit scheduling information
    const context = {
      timesDiscussed: [],
      datesDiscussed: [],
      timezonesmentioned: [],
      urgencyLevel: 'normal',
      topicsDiscussed: []
    };

    for (const msg of messages) {
      // Parse dates/times mentioned
      const parsed = chrono.parse(msg.content);
      if (parsed.length > 0) {
        context.datesDiscussed.push(...parsed.map(p => p.text));
      }

      // Check for urgency keywords
      if (/urgent|asap|soon|immediately/i.test(msg.content)) {
        context.urgencyLevel = 'high';
      }

      // Extract timezone mentions
      const tzMatch = msg.content.match(/\b([A-Z]{3,4})\b|(\w+)\s+time\b/gi);
      if (tzMatch) {
        context.timezonesmentioned.push(...tzMatch);
      }
    }

    return context;
  }
}

