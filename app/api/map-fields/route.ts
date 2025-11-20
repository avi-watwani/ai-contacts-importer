import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(request: NextRequest) {
  try {
    const { headers, systemPrompt } = await request.json();

    if (!headers || !Array.isArray(headers)) {
      return NextResponse.json(
        { error: 'Invalid headers provided' },
        { status: 400 }
      );
    }

    // Get API key from environment
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.error('GEMINI_API_KEY is not set in environment variables');
      return NextResponse.json(
        { error: 'Gemini API key is not configured' },
        { status: 500 }
      );
    }

    console.log('Initializing Gemini with API key...');
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use the available model
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

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Error in map-fields API:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to map fields' },
      { status: 500 }
    );
  }
}

