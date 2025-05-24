---
title: "AI-Powered Mashups: A New Era of Dynamic User Interfaces"
date: 2025-05-24T16:00:06.193Z
slug: ai-powered-site-mashups
authors:
  - andreban
---

[Paul Kinlan recently wrote][1] about how latency of AI models to generate UIs with HTML, CSS and JavaScript is decreasing significantly, and how that can lead to user UIs that are ephemeral, dynamically generated, and specialized to the user need at hand.

> To me, the direction of travel is clear. UI generation to service user-goals is going to happen.

Combining this with [Model Context Protocol(MCP)][3] has got me thinking about the good old [site mashups][4], and how AI agents can unleash a new, modernized version of them. If you haven't heard about mashups before, here's what Gemini has to say about them: 

> A site mashup combines data, functionalities, or applications from two or more distinct web sources into a single, integrated user experience. This is typically achieved by leveraging publicly available APIs (Application Programming Interfaces) or RSS feeds, allowing developers to extract and re-present content in a new and innovative way, often without owning the original data sources. For example, a real estate mashup might combine map data from Google Maps with property listings from a real estate website to visually display homes for sale in a specific area.

One of the challenges with site mashups was that, while combining functionality from different sites led to unique experiences, those were also frequently niche, sometimes specific to individuals, and the effort to build them meant they would rarely pay off beyond developers building toy applications for themselves.

AI models solve this particular problem by removing the need for a developer to create the UI, and MCP server provide a standardized description of APIs that AI Agents can call or use in the application they are building. 

## AI Agents as a platform for site mashups
The ability of AI Agents to use tools, standardized with the MCP protocol, allows AI Agents to integrate services into the conversation with the user. However, many user interactions don't work well on a chat interface, an having an UI can be a better way to show structured information or ask for user input, and that's were mini-apps with dynamic UIs and MCP servers come in.

Imagine planning a holiday trip, the user may want to find suitable flight, a hotel that matches their preferences, create an intinerary of local attractions, dinner at restaurants that matches their taste and, finally, book their reviews - this usually requires interacting with different services, and keeping track of your own itinerary.

An AI agent, through the MCP protocol, can use different sources to check reviews for hotels, attractions and restaurants, check their prices and availability, and finally, create all bookings as needed, taking into account the user's own preference. In this workflow, some bits of information can work well in a chat interface, like showing the summary of the reviews of a restaurant. Others might work better with a UI, like showing the location of available hotels in a map, or asking the user to pick attractions they are interested from a list, but checking them.

Being able to create UIs dynamically and instantly would allow those integrations to happen with the best UI possible to the task at hand, and aligned with that user's preferences.

It's possible to imagine entire businesses that only provide services via MCP, being effectively UI-less, and relying on AI agents to drive business to them.

## Challenges
While the performance of the current models is incredible, they are not instant (yet), with that being a significant blocker for this kind of mashup. 

Another important blocker is figuring out the monetization model for applications providing content to AI Agents - while for a flight, restaurant, or hotel booking services the benefit is clear, since the AI Agent is directly generating business for them, services like review sites will need a good way to monetize the content they are providing. Maybe the AI Agent would pay for access to those services, on behalf of their user.


[1]: https://aifoc.us/posts/latency/
[3]: https://en.wikipedia.org/wiki/Model_Context_Protocol
[4]: https://en.wikipedia.org/wiki/Mashup_(web_application_hybrid)
