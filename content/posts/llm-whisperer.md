---
title: the llm whisperer
date: 2026-03-08T20:00:00.000Z
slug: llm-whisperer
draft: false
authors:
  - paulkinlan
---

When I was at Liverpool John Moores University studying software engineering, my best friend Jon pulled me aside and told me I had a verbal tick. Instead of saying "um" or "uh" between words, I was saying "f***ing." Three or four times a sentence. I was doing it in normal conversation with friends, with people I'd just met, even with lecturers. I had absolutely no idea. Once he pointed it out, I started trying to listen to myself as I spoke. I'd slow down, really concentrate on not swearing, not dropping in filler words. It was hard, but I think it improved the way I communicated. Over the years since university, I always wanted to push myself a little more, and doing public presentations was a way that helped me improve how I communicated, which ultimately led me to finding my way into developer relations.

Once I was there, where people see the job as "talking for a living" (it's maybe 2% of the job), I had to develop a whole system around it. My very first Google I/O talk was in 2011, ["Mobile Web Development: Zero to Hero"](https://www.youtube.com/watch?v=vV85dNeGRhY) with [Mike Mahemoff](https://mahemoff.com/paper/). I loved working with Mike. He's an amazing presenter, and he taught me a lot about the art of developer relations and developer experience. But because Mike was a professional at this, we had to do proper practice runs. I remember being in the Intercontinental Hotel next to the Moscone Center in San Francisco, the two of us in a hotel room doing practice presentations, and every time I dropped an "uh" or an "um," Mike would point it out. Again, it made me slow down my thinking for my speaking. I script my presentations carefully now because if I go off-script, I wander. I say "um" and "and" constantly. I lose the thread. The gap between how I think and how I speak has always been wide.

I never once thought this would be a useful way to operate a computer. Well, here I am, writing programs and even this post just with my voice.

For most of my career, the thing I liked about programming was that it wasn't talking. It was thinking, quietly, and articulating what I wanted through code. A completely different method of communicating. It was the slower, more deliberate way of thinking, and it worked well for me.

I remember Dragon Naturally Speaking. My dad got a copy years ago and it was terrible. I had a friend called Ben who got RSI so bad he couldn't use a keyboard anymore. He had to program with his voice. Watching him and other people who needed assistive technology struggle to use computers efficiently, I never thought I'd want to control a computer that way.

And now it's the primary way I interact with a computer. I even built a Chrome extension called [Utter](https://github.com/PaulKinlan/utter) to make it easier. It uses the [Web Speech Recognition API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), which detects utterances in real time and is surprisingly good. But because it's real time, I get to watch myself speak. Every "um," every false start, every moment where my sentence wanders off in one direction and then doubles back. All my filler words and verbal tics, right there on screen as I'm talking. It's like holding up a mirror to the way I think out loud. And it's a mess. But the LLM doesn't seem to mind. It's pretty amazing, actually, how well it parses all of that and understands the intent of what I meant.

That's the part that surprised me. Not that voice input exists, but that it works *despite* the way I speak. As I was [journaling my day](/prompt-is-the-program), I dictated: "we had dinner at the Harden Estate." Claude figured out I meant Hawarden Estate, a real place in Flintshire, about 30 minutes from where I live. "Bio connect" becomes "I/O Connect." "D side" becomes "Deeside." The LLM isn't doing speech recognition. It's doing *meaning* recognition, using everything it already knows about the context of my life. It's less like dictation and more like having a conversation with someone who's been paying attention.

The difference between this and Dragon Naturally Speaking is that Dragon tried to turn speech into text accurately. If what I said was actually transcribed literally, the way I talk, it would be impossible for me to use a computer. My experience with Utter proves that every time I watch the real-time transcription scroll by. But LLMs don't need an accurate transcription. They pick up my intent and my meaning. Those are completely different problems, and the second one turns out to be dramatically more forgiving of the way real people actually talk.

I've been running a [journal system](/prompt-is-the-program) for the past few weeks that's built entirely on voice. I dump context about my day: what happened, who I spoke to, what I need to do, an idea I had while walking the dog. The sentences are haphazard. I don't structure them. I ramble, include half-thoughts, go on tangents. And the model synthesizes all of it into structured notes, cross-referenced with people and topics and dates. It works better than anything I've typed.

I've been testing this: voice input produces *better* prompts than text, at least for me. I can type quickly, but typing fast isn't the same as communicating fast. When I type, I write a sentence, go back, edit it, rewrite half of it, delete a clause, add it back. That cycle of writing and editing eats up a huge amount of time. When I speak, I stop filtering and just talk. I can spend the same amount of time I'd normally take to type something out and be vastly more expressive, because the model picks up on all of it.

It's been a game changer for things like journaling, which used to take me a long time to sit down and do. I did it because I found it genuinely useful, but there was always friction. With voice, it feels almost friction-free. And the same thing is happening with programming. I can think through a back and forth with the model, build up a PRD with my voice, keep iterating on it, layer in more detail each time. I review every single thing that comes out of the model to make sure it maps to my intent. But the ratio of what I can produce and then review, compared to what I can write and then review, is remarkable. Speak and review beats write and review, by a lot.

I've started editing documents with my voice too. I can say "remove this part of the paragraph" or "change the intent of this sentence" and the model is surprisingly good at understanding both the instruction and what I actually wanted to say, and mapping it back in. It reminds me of Harrison Ford in [Blade Runner](https://en.wikipedia.org/wiki/Blade_Runner), talking to the [Esper machine](https://bladerunner.fandom.com/wiki/Esper): "enhance," "stop," "move in," "give me a hard copy right there." He's having a conversation with the image, controlling it entirely with his voice. (Now that I've mentioned it, I couldn't help myself. I had to go and [build the thing](https://esper.val.run/).)

{{< iframe "https://esper.val.run/" "600" >}}

{{< youtube id="LQJ0EEn357I" class="youtube" >}}

We can do that now, not with a fictional photo scanner, but with actual documents, code, images. It feels like having a conversation with the document rather than moving a cursor around and deleting words. I still end up at the same output, but I get there in a completely different way.

Building Esper made me realise how well placed the web actually is for this kind of thing. Not like the old days of [VoiceXML](https://en.wikipedia.org/wiki/VoiceXML), which I used to work with at a small company in Liverpool, where you had these voice menu systems that you had to carefully program and think through every branch of. Now you can describe some basic intent, define some tools, and use the Speech Recognition API to capture what the user said and map that to a command in the application.

The Esper demo is a working example of this pattern. The speech recognition part is straightforward:

```javascript
const rec = new SpeechRecognition();
rec.continuous = true;
rec.interimResults = true;

rec.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    if (event.results[i].isFinal) {
      processVoiceCommand(event.results[i][0].transcript.trim());
    }
  }
};
```

The `/api/interpret` endpoint is just a prompt. It describes the available actions and tells the LLM to map freeform speech into structured JSON commands:

```text
You are the voice command interpreter for the ESPER machine.
The image is divided into a 10x10 sector grid: columns A-J, rows 1-10.

Interpret the user's speech and return a JSON array of commands.

Available actions:
- { "action": "zoom_in", "amount": 1-10 }
- { "action": "zoom_out", "amount": 1-10 }
- { "action": "pan", "direction": "left"|"right"|"up"|"down", "amount": 1-5 }
- { "action": "move_to_sector", "sector": "E-5" }
- { "action": "enhance" }
- { "action": "reset" }
- { "action": "hardcopy" }

A single utterance can map to MULTIPLE commands in sequence.
E.g. "go to sector B-3 and enhance" = move_to_sector + enhance.
"zoom in on the top right" = zoom_sector with sector around I-2 or J-1.
```

The client sends the transcript, gets back structured commands, and executes them:

```javascript
async function processVoiceCommand(text) {
  const resp = await fetch('/api/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: text }),
  });
  const { commands } = await resp.json();

  for (const cmd of commands) {
    switch (cmd.action) {
      case 'zoom_in':    zoomIn(cmd.amount); break;
      case 'zoom_out':   zoomOut(cmd.amount); break;
      case 'pan':        panDirection(cmd.direction, cmd.amount); break;
      case 'enhance':    await enhance(); break;
      case 'reset':      resetView(); break;
      case 'hardcopy':   exportImage(); break;
    }
  }
}
```

That's the entire pattern. The prompt defines what the application can do. The LLM handles all the messy work of turning "move in a bit" or "go left and enhance" into structured actions. No intent classification, no grammar trees, no branching dialogue logic. Just a description of the tools and a model that figures out what you meant.

This is a simple example, but it points at something bigger. It's now possible to build applications that are genuinely reactive to voice in a way that feels natural for everyone. The accessibility tools we've had until now have been critical for enabling people to use computers, and they'll continue to be, but I think there's going to be a real step change in what voice interaction looks like. The web can be at the forefront of that.

It's also interesting to think about where this goes with [WebMCP](https://developer.chrome.com/blog/webmcp-epp), which is starting to land in Chrome. WebMCP lets sites expose structured, callable tools to third-party agents, much like [Web Intents](https://paul.kinlan.me/what-happened-to-web-intents/) tried to do years ago. In the Esper demo I defined the available actions manually in a prompt, but what if those tools were already declared by the site itself? Hook WebMCP up with voice recognition and a small agentic loop, and you've got something genuinely interesting to explore.

If voice becomes the dominant way people interact with AI, and I think it will, we have a physical problem. A lot of people who build software today rely on complete silence around them, which is why open plan offices have always been a struggle. Programming requires deep thinking, and noise breaks that. But the way I use these tools now, I'm still thinking, I'm just using conversation as the way I think. I'm lucky enough to have my own office at home in North Wales, but most people don't have that luxury. I actually don't know if social norms will shift enough to let people just talk to a computer at their desk. Video calls at desks are still frowned upon in most offices, and talking to an AI would be even stranger.

One thing I've noticed about myself though: I actually don't like the computer talking back to me. Unless I literally have to be hands-free, I prefer voice input with text output. I want to speak my thoughts and read the response. It's a strange asymmetry, but it works. Maybe it's because reading is faster than listening. It's voice in, text out.

If it wasn't for Jon being honest and direct with me, like all good friends are, I probably wouldn't be here right now, talking to and building with a computer in the same way. Love you, bud.
