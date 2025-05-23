---
title: super-apps
date: 2025-05-12T12:05:38.727Z
slug: super-apps
authors:
  - paulkinlan
---

I’ve spent two weeks in April wandering around Japan with my wife, daughter and parents - it was incredible. I used a browser twice. Most of the time that I spent with my phone wasn’t on the web or in traditional apps, it was in a LLM.

I would give the LLM photos of packets of food and ask what it is and it would handily tell me the brand, and then I could follow up and with a photo of the back of the packet and ask if there was milk in it (my daughter can’t drink milk), and it would explain the ingredients and potential allergens.... Given my non-existent ability to read Japanese I had to trust the LLM.

We went to Kyoto and I would ask the LLM what was written on the noticeboard of the shrine and what the cultural importance of it was, and it would tell me. I sat on a tourist train trundling through a valley pointing my camera at something that looked like a nuclear reactor - turns out it was a stadium.

While waiting outside a pharmacy I would ask the LLM to tell me the latest news about the local area and it would present a quick overview of what had happened in English from Japanese sources.

As I wandered around Himeji castle and had questions, I could just check the LLM. As I saw the fish gargoyles that adorn each of the roofs on the castle, I could ask what they were and their cultural relevance and get a comprehensive answer. A lot more than I could from the placards I dotted around the site.

As we were riding the Shinkansen back to Tokyo I wondered how many sites were blocking LLM’s User-Agents, so I asked Gemini to build a script that would check (and copied it into my Android Linux terminal - it didn’t work, python wasn’t installed, but it was so close).

I rarely left these tools and it's been on my mind a lot.

A couple of months ago I had two ideas running around my head. The first was me musing if it was possible to have a future programming language built around prompts, and the second was will it be possible to build UIs based on a goal. Combining the two ideas I created a little toy-library called `f` and a demo that would build a UI for a site based on a request to a JSON API using as plain-english as I can currently get. I was blown away by how far you can get by describing your goals. Want a form that collects data? Great, just describe it! Want a UI built for a random API? Just point it at the data and ask it to build the UI.

```javascript
const getSpaceData =
  await f`fetch JSON from https://api.spaceflightnewsapi.net/v4/articles/`;

const news = await getSpaceData();

// Describe the data structure so the the UI prompt has a better idea of what to build.

const generateSchema =
  await f`Return a JSON Schema for a given object. The schema should be in the format defined in https://json-schema.org/understanding-json-schema/reference/object.html and should include all the properties of the object. The schema should include the type of the property, the format of the property, the required status of the property, and the description of the property. The schema should include all the properties of the object. The schema should include the type of the property, the format of the property, the required status of the property, and the description of the property.`;

// Describe the data
const schemeDescription = generateSchema(spaceData);

const buildSpaceUI =
  await f`Using the data defined in <output> create a UI that will best display the space flight information. The developer will provide the data as a parameter and it will be in the format defined in <output>.

<output>${JSON.stringify(schemeDescription)}</output>`;

document.body.appendChild(buildSpaceUI(spaceData));
```

{{< figure src="/images/f.png" alt="f" caption="Dynamically generated UI from prompts" >}}

So why is Japan and ‘f’ in the same article?

I had to work for two days on this vacation and I was relating my use of Gemini and ChatGPT to a friend about how every time I go to China show me how pervasive WeChat is across people's lives. Yes, on this trip I wasn’t ordering food, cars, laundry or anything else, but for my needs both Gemini and ChatGPT gave me everything I needed. Translations, background information, local-news, and even a bit of work that I needed to think about.

In that conversation, I was describing the experience of how I took a photo of a nuclear reactor and ChatGPT built a little program that scanned and panned the image to find where I was and what I was looking at. It built a mini application to solve the problem (see below) and it hit me....

{{< figure src="/images/chatgpt-scan-1.png" alt="WeChat" caption="Chat GPT thinking and building - part 1" >}}

{{< figure src="/images/chatgpt-scan-2.png" alt="WeChat" caption="Chat GPT thinking and building - part 2" >}}

We’re not far away from tasks, be it expressed via text replies and "thinking tokens" or dynamic UI's and applications that are built to service a single user requests from directly inside the LLM.

I started to describe this in "[The Disposable Web](https://paul.kinlan.me/the-disposable-web/)", that it is becoming easier to create software that solves one problem once. And when I compare what can be created today in the canvases of these tools against many of the run-of-the-mill CRUD style experiences that operate inside WeChat and it feels easy (for me at least) to draw a connection that we are not far away from getting these applications built dynamically inside a LLM to service the need for the user, and when that happens, what’s next for the web?

Many of the apps inside WeChat are not incredibly complex, they are run-of-the-mill CRUD style experiences. We’re really not far away from getting these built dynamically and when that happens, what’s next for the web? I can see a straight line between WeChat and the experience I had in Gemini and ChatGPT. Yes, the experience in ChatGPT took a while to create (according to the “thinking” timing, it was over 90 seconds) and today it is far too slow for applications as we know it. If we use the Jacob Nielsen research ["0.1 seconds (100 ms) creates the illusion of instantaneous response" (2025)](<https://jakobnielsenphd.substack.com/p/time-scale-ux#:~:text=0.1%20seconds%20(100%20ms)%20creates%20the%20illusion%20of%20instantaneous%20response>) as a target, then it looks like we have to make a 100 fold improvement to token generation to build blocking-free UI. How many Tokens/s do we need to make things feel instant? I think that might come sooner rather than later, model improvements seem inevitable and hardware improvements like Groq are showing that there is already a path.

HTML, CSS and JavaScript are the most expressive languages available today to render a UI and LLMs are pretty good today at generating them, so to me there is a world where this will be the easiest route to build UI that will service the specific needs of a user request directly in one of these LLMs and you rarely ever need to leave.

If you combine this with Agent communication protocols like MCP which are changing the way that we chain more complex apps and tasks together, it really feels like we are at the start of a major [transition](/transition/) in computation and user interaction.

I argue pretty strongly that the web’s super power is the link. It lets anyone click on it and then navigate to an experience. App platforms would kill for this power because today their restrictive review process and restriction on what can run in their sandboxes (there are limits to what they allow developers to run dynamically - e.g, iOS relatively recently allowed none browsers to run dynamic JS). Tools like ChatGPT are doing an end-run around this restriction and to me the power of the link is in question. Who needs a link anymore when you can recall any text or will any experience into existence?

HTML and JavaScript are the most expressive languages to render a UI. It’s not a stretch for a UI to be created to service the specific needs of a user request, or when an Agent wants some form of human input. If any application can do this, then what is the future for web apps? Will apps just live inside these apps like mini-apps live inside WeChat? Should the Web Platform engineers at browser companies invest more in in-app experiences (i.e, WebView)? Should we as an industry do more to enable any website in the browser to do the same?

There's a lot the web can already do to be the primary platform for this type of experience... We have sand-boxing for arbitrary code execution be it JS or any other flavour with WASM. We have the ability to run arbitrary code in a webview, and we have the ability to run arbitrary code in a web worker away from the UI. I wonder if there will be a future where we pull in small parts of existing web app's DOM and run them inside a new super-app, [or even define custom-element contracts](https://paul.kinlan.me/custom-elements-ecosystem/#:~:text=Platforms%20as%20the%20decider%20of%20the%20component%20suite) that will enable us to load widgets from other sites and enable "my" UI to be surfaced in the app.

I actually don’t know where the future will go, but the recent experiences that I’ve had lean me towards Gemini or ChatGPT being a new type of [headless web](https://paul.kinlan.me/the-headless-web/) and I don’t think we are far away from having the everything app for the west?

Who needs a browser anymore?
