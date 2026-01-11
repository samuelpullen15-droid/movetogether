import { User, Competition, Achievement } from './fitness-store';

export interface CoachMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SYSTEM_PROMPT = `You are Coach Spark, a friendly AI fitness coach. Be encouraging, positive, and give actionable advice. Keep responses concise (2-3 short paragraphs). Use occasional emojis.

Help users:
- Win fitness competitions against friends
- Improve their Move (calories), Exercise (minutes), and Stand (hours) ring completion
- Stay motivated with healthy habits

Always reference their actual stats when giving advice.`;

export function buildContextPrompt(
  user: User,
  competitions: Competition[],
  achievements: Achievement[]
): string {
  const moveProgress = Math.round((user.moveCalories / user.moveGoal) * 100);
  const exerciseProgress = Math.round((user.exerciseMinutes / user.exerciseGoal) * 100);
  const standProgress = Math.round((user.standHours / user.standGoal) * 100);

  const activeCompetitions = competitions.filter((c) => c.status === 'active');

  let competitionInfo = '';
  activeCompetitions.forEach((comp) => {
    const sorted = [...comp.participants].sort((a, b) => b.points - a.points);
    const userRank = sorted.findIndex((p) => p.id === user.id) + 1;
    const userParticipant = sorted.find((p) => p.id === user.id);

    if (userParticipant && userRank > 0) {
      const leader = sorted[0];
      const pointsBehind = userRank > 1 ? leader.points - userParticipant.points : 0;
      competitionInfo += `${comp.name}: #${userRank}/${comp.participants.length}, ${userParticipant.points}pts${pointsBehind > 0 ? `, ${pointsBehind} behind ${leader.name}` : ' (leading!)'}. `;
    }
  });

  return `User: ${user.name}
Today: Move ${moveProgress}% (${user.moveCalories}/${user.moveGoal} cal), Exercise ${exerciseProgress}% (${user.exerciseMinutes}/${user.exerciseGoal} min), Stand ${standProgress}% (${user.standHours}/${user.standGoal} hrs)
Streak: ${user.streak} days
Competitions: ${competitionInfo || 'None active'}`;
}

export async function sendCoachMessage(
  userMessage: string,
  conversationHistory: CoachMessage[],
  contextPrompt: string
): Promise<string> {
  // Combine system prompts into one to reduce message count
  const combinedSystemPrompt = `${SYSTEM_PROMPT}

${contextPrompt}`;

  const messages = [
    { role: 'system' as const, content: combinedSystemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const apiKey = process.env.EXPO_PUBLIC_VIBECODE_OPENAI_API_KEY;

  console.log('[Coach] Sending message to API...');
  console.log('[Coach] API Key exists:', !!apiKey);
  console.log('[Coach] Message count:', messages.length);

  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-nano',
        messages,
        max_completion_tokens: 500,
        temperature: 1,
      }),
    });

    console.log('[Coach] Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Coach] API Error Response:', errorText);
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[Coach] Full response:', JSON.stringify(data));

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[Coach] Invalid response structure:', data);
      throw new Error('Invalid response from API');
    }

    let content = data.choices[0].message.content;
    console.log('[Coach] Raw content:', content, 'Type:', typeof content);

    // Handle various empty/invalid content formats
    if (
      !content ||
      content === "''" ||
      content === '""' ||
      content.trim() === '' ||
      content.trim() === "''" ||
      content.trim() === '""'
    ) {
      console.log('[Coach] Empty content received, using fallback');
      // Return a contextual fallback response based on the user's message
      return generateFallbackResponse(userMessage, contextPrompt);
    }

    // Clean up content if it has extra quotes
    if (content.startsWith("'") && content.endsWith("'")) {
      content = content.slice(1, -1);
    }
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }

    return content;
  } catch (error) {
    console.log('[Coach] API error:', error);
    throw error;
  }
}

function generateFallbackResponse(userMessage: string, context: string): string {
  const lowerMessage = userMessage.toLowerCase();

  // Parse context for stats
  const moveMatch = context.match(/Move (\d+)%/);
  const exerciseMatch = context.match(/Exercise (\d+)%/);
  const standMatch = context.match(/Stand (\d+)%/);
  const streakMatch = context.match(/Streak: (\d+)/);

  const movePercent = moveMatch ? parseInt(moveMatch[1]) : 0;
  const exercisePercent = exerciseMatch ? parseInt(exerciseMatch[1]) : 0;
  const standPercent = standMatch ? parseInt(standMatch[1]) : 0;
  const streak = streakMatch ? parseInt(streakMatch[1]) : 0;

  if (lowerMessage.includes('win') || lowerMessage.includes('competition')) {
    const lowestRing = movePercent <= exercisePercent && movePercent <= standPercent ? 'Move' :
                       exercisePercent <= standPercent ? 'Exercise' : 'Stand';
    return `Great question! 🎯 Looking at your rings, I'd focus on your ${lowestRing} ring - it has the most room for improvement. Every point counts in competitions!\n\nTry to close all three rings today. Consistency is what separates winners from the rest. You've got a ${streak}-day streak going - don't break it! 💪`;
  }

  if (lowerMessage.includes('motivat') || lowerMessage.includes('encourage')) {
    return `You're doing amazing! 🌟 Your ${streak}-day streak shows real dedication. That's not luck - that's discipline!\n\nRemember: every champion was once someone who refused to give up. Your Move ring is at ${movePercent}%, Exercise at ${exercisePercent}%, and Stand at ${standPercent}%. Let's close them all today! 🔥`;
  }

  if (lowerMessage.includes('progress') || lowerMessage.includes('doing')) {
    const avgProgress = Math.round((movePercent + exercisePercent + standPercent) / 3);
    return `Here's your progress today! 📊\n\n🔴 Move: ${movePercent}%\n🟢 Exercise: ${exercisePercent}%\n🔵 Stand: ${standPercent}%\n\nYou're averaging ${avgProgress}% across all rings. ${avgProgress >= 80 ? "Almost there - finish strong!" : avgProgress >= 50 ? "Solid progress! Keep pushing!" : "Still plenty of time to crush it today!"} 💪`;
  }

  if (lowerMessage.includes('tip') || lowerMessage.includes('advice') || lowerMessage.includes('help')) {
    return `Here are my top tips for you! 💡\n\n1. Set hourly reminders to stand and move\n2. Take walking meetings or calls\n3. Park farther away or take stairs\n4. Do quick 5-minute exercise bursts\n\nSmall actions add up to big results. You've got this! 🏆`;
  }

  // Default response
  return `Hey there! 👋 I can see you're at ${movePercent}% Move, ${exercisePercent}% Exercise, and ${standPercent}% Stand today.\n\nAsk me about winning competitions, getting motivated, checking your progress, or tips to close your rings faster! I'm here to help you succeed! 💪`;
}

export const COACH_QUICK_PROMPTS = [
  { label: '🎯 How can I win?', prompt: 'What should I focus on to win my current competitions?' },
  { label: '💪 Motivate me', prompt: 'I need some motivation to keep going today!' },
  { label: '📊 My progress', prompt: 'How am I doing with my fitness goals today?' },
  { label: '🏆 Competition tips', prompt: 'Give me specific tips to beat my competitors' },
];
