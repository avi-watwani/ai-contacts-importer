import { GoogleGenerativeAI } from '@google/generative-ai';

export async function getMappingSuggestions(
  headers: string[],
  systemPrompt: string
): Promise<any> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured');
      throw new Error('Gemini API key is not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try with the regular model first (thinking mode might not be available)
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-pro'
    });

    const prompt = `${systemPrompt}\n\nNow, map these headers:\n${JSON.stringify({ headers })}`;

    console.log('Sending request to Gemini with', headers.length, 'headers');
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    
    console.log('Received response from Gemini');
    
    // Extract JSON from response (removing markdown code blocks if present)
    const jsonMatch = text.match(/```json\n?([\s\S]*?)\n?```/) || text.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : text;
    
    const parsed = JSON.parse(jsonText.trim());
    console.log('Successfully parsed mapping result');
    
    return parsed;
  } catch (error) {
    console.error('Error getting mapping suggestions:', error);
    if (error instanceof Error) {
      throw new Error(`Failed to get AI mapping suggestions: ${error.message}`);
    }
    throw new Error('Failed to get AI mapping suggestions');
  }
}

