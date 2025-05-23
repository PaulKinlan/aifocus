---
title: latency
date: 2025-05-22T19:59:06.193Z
slug: latency
---

I spent an [evening in a fictitious web](https://paul.kinlan.me/fictitious-web/). The faux-browser window hosted at [WebSim.ai](https://websim.ai/) gave me a view into a virtual world that didn't exist, but one that felt like it did. Every page that I visited was created in the moment that I requested it, willed into existence by a generative AI model.

It was like the early days of the web. Every page felt fresh and unique. Some were high quality, some were low-fi. All were incredibly slow to load. I was on a dial-up connection in 2024. Even when my college's shared connection in '98 was on a slow leased line, sites frequently took minutes to load, but at the time it didn't matter, I had this new world to explore.

It wasn't until much later in my career that I learned about the importance of latency in web applications. The speed at which a page loads and responds to user interactions can make or break the user experience. In 1993, Jakob Nielsen published his first paper on the topic of response times and how they affect user experience. He identified four key limits for response times:

> 0.1 second is about the limit for having the user feel that the system is reacting instantaneously, meaning that no special feedback is necessary except to display the result.
>
> 1.0 second is about the limit for the user's flow of thought to stay uninterrupted, even though the user will notice the delay. Normally, no special feedback is necessary during delays of more than 0.1 but less than 1.0 second, but the user does lose the feeling of operating directly on the data.
>
> 10 seconds is about the limit for keeping the user's attention focused on the dialogue. For longer delays, users will want to perform other tasks while waiting for the computer to finish, so they should be given feedback indicating when the computer expects to be done. Feedback during the delay is especially important if the response time is likely to be highly variable, since users will then not know what to expect.

&mdash; [Jakob Nielsen - 1993](https://www.nngroup.com/articles/response-times-3-important-limits/)

This was written at the dawn of the web and was later [refined in 2014 for web applications](https://www.nngroup.com/articles/response-times-3-important-limits/#:~:text=Web%2DBased%20Application%20Response%20Time) and I think that it's interesting that streaming of responses has been used as a way to keep people engaged with LLMs. Yes, streaming of responses has been an interesting hack to improve the perception of speed, and yes, fundamentally these models are doing trillions upon trillions of calculations to get us an answer, but it doesn't change the fact that the underlying model is slow to generate the content,

We are at the early days of the web again. The content or the "apps" are currently slow to generate and sometimes the experiences like those created with the "Canvas" apps can feel a little low-fi too, but we are in a [transition](/transition/) and it's because these tools feel valuable we are happy to put up with the latency to get a complete response. Seeing these responses generate and stream in feels like the progressive loading of HTML on a slow-connection when you could see the page UI progressively load and JPEGs slowly unblur into full view. It seems to me that we are in the modem phase right now waiting for the broadband transition to happen.

It's not clear to me that the current "chat" interface are _the_ future &mdash; It can be tiring to engage when all I want to do is prod buttons and swipe on things &mdash; I'd argue that if the future of computing is through tools like LLMs, be it a [superapp](/superapps/) or any existing app, chewing through arbitrary tasks that the user requests we are going to need goal-based generative UI.

Ben Thompson has frequently noted that if there is to ba a future in VR/XR based experiences, the sheer amount of content that needs to be created combined with the complexity to create that content, there will need to be a massive shift to systems that generate UI to service a users need based on context and intent.

> AI, however, will enable generative UI, where you are only presented with the appropriate UI to accomplish the specific task at hand. This will be somewhat useful on phones, and much more compelling on something like a smartwatch; instead of having to craft an interface for a tiny screen, generative UIs will surface exactly what you need when you need it, and nothing else.
>
> Where this will really make a difference is with hardware like Orion. Smartphone UI’s will be clunky and annoying in augmented reality; the magic isn’t in being pixel perfect, but rather being able to do something with zero friction. Generative UI will make this possible: you’ll only see what you need to see, and be able to interact with it via neural interfaces like the Orion neural wristband. Oh, and this applies to ads as well: everything in the world will be potential inventory.

[Ben Thompson - Stratechery - Meta's AI Abundance, October 2024](https://stratechery.com/2024/metas-ai-abundance/#:~:text=AI%2C%20however%2C%20will,be%20potential%20inventory.)

Last year, I wrote a little experiment for a goal-based UI generation using the [reactive-prompts](https://paul.kinlan.me/projects/reactive-prompts) library. Given a goal and the data that you already have to solve that goal it would create a user-interface that captures the rest of the information. I was surprised that even 12 months ago it was possible for simple data collection based goals to be generated.

Data collection feels like a good first step in LLMs because we don't need full-applications to get a job done, and the parameters seem to be more easily knowable to our tools. It raises a fundamental question about the concept of an application as we know it today might not exist in the future given that Chain of Thought tools are breaking down a goal (an app in the old context) into finite tasks, and then only requiring intervention when it can't progress.

Today, these UIs can take many seconds to create, and because of the progressive nature of HTML, you can see the UI incrementally load. This might be ok, given that people seem quite happy to wait while the models "think" or stream their response, but we will see a step-change in engagement and interaction when these UIs start getting to Jacob Nielsen's thresholds for interaction.

Ben Thompson also noted in 'Sora, Groq and Virtual Reality' _"[which means the speed of token calculation is at an absolute premium.](https://stratechery.com/2024/sora-groq-and-virtual-reality/#:~:text=which%20means%20the%20speed%20of%20token%20calculation%20is%20at%20an%20absolute%20premium)"_ 100%. How away are we from getting truly instant UIs generated?

Naively, you have to generate HTML, CSS and JS and by [estimating the number of tokens generated via tcnt](https://npmjs.org/package/tcnt) the following form is 251 tokens.

```html
<form>
  <input type="text" name="name" />
  <input type="text" name="email" />
  <button type="submit">Submit</button>
</form>
<script>
  document.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    const email = e.target.email.value;
    console.log(name, email);
  });
</script>
<style>
  form {
    display: flex;
    flex-direction: column;
  }
  input {
    margin-bottom: 10px;
  }
  button {
    background-color: blue;
    color: white;
    border: none;
    padding: 10px;
    cursor: pointer;
  }
  button:hover {
    background-color: darkblue;
  }
</style>
```

I found this [LLM speed benchmark](https://github.com/coder543/llm-speed-benchmark/blob/main/results/README.md) to be a good indicative reference for the current state of play. Ranging from 50 tokens per second for the slower but higher quality models to 350 tokens per second for the faster models, potentially lower quality models. Obviously a lot has changed since 2024, but the order of magnitude is the same.

My first reaction (and probably yours) is "Hey, it should only take 1 second to generate that form... what's the problem?"

But this is not a realistic example because it was hand-crafted by me for a contrived scenario. When building UI with a prompt, there are a number of other things we have to consider:

1. What is the prompt? We have to include the prompt in the token count and processing time.
2. Is there "thinking" required, or is there error correction required? This is a non-linear process and can take a long time to get right.
3. The latency induced by the network request. Setting up a TLS connection can take 200ms.

A more realistic scenario might be a checkout form with a number of items pre-populated, that you need to get the users confirmation for a purchase.

```react
import React, { useState } from "react";

// Main App component
const App = () => {
  // State for form fields
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    address: "",
    city: "",
    zip: "",
    cardNumber: "",
    expiryDate: "",
    cvv: "",
  });

  // State for shopping basket items
  const [basketItems, setBasketItems] = useState([
    { id: 1, name: "Wireless Headphones", price: 129.99, quantity: 1 },
    { id: 2, name: "Smartwatch", price: 199.99, quantity: 1 },
    { id: 3, name: "Portable Bluetooth Speaker", price: 79.99, quantity: 1 },
  ]);

  // Handle input changes for form fields
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  // Handle deleting an item from the basket
  const handleDeleteItem = (id) => {
    setBasketItems(basketItems.filter((item) => item.id !== id));
  };

  // Calculate total price of items in the basket
  const calculateTotal = () => {
    return basketItems
      .reduce((total, item) => total + item.price * item.quantity, 0)
      .toFixed(2);
  };

  // Handle checkout button click
  const handleCheckout = () => {
    // In a real application, you would send formData and basketItems to a server
    console.log("Checkout initiated!");
    console.log("Form Data:", formData);
    console.log("Basket Items:", basketItems);
    alert("Checkout successful! (This is a demo)"); // Using alert for demo purposes
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-4xl flex flex-col lg:flex-row gap-8">
        {/* Customer Information Section */}
        <div className="flex-1">
          <h2 className="text-3xl font-extrabold text-gray-800 mb-6 text-center">
            Checkout
          </h2>

          {/* Contact Information */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Contact Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="fullName"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Full Name
                </label>
                <input
                  type="text"
                  id="fullName"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                  placeholder="john.doe@example.com"
                />
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="mb-6">
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Shipping Address
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label
                  htmlFor="address"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Address
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                  placeholder="123 Main St"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="city"
                    className="block text-sm font-medium text-gray-600 mb-1"
                  >
                    City
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                    placeholder="Anytown"
                  />
                </div>
                <div>
                  <label
                    htmlFor="zip"
                    className="block text-sm font-medium text-gray-600 mb-1"
                  >
                    Zip Code
                  </label>
                  <input
                    type="text"
                    id="zip"
                    name="zip"
                    value={formData.zip}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                    placeholder="12345"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Payment Information */}
          <div>
            <h3 className="text-xl font-semibold text-gray-700 mb-4">
              Payment Information
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label
                  htmlFor="cardNumber"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Card Number
                </label>
                <input
                  type="text"
                  id="cardNumber"
                  name="cardNumber"
                  value={formData.cardNumber}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                  placeholder="**** **** **** ****"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="expiryDate"
                    className="block text-sm font-medium text-gray-600 mb-1"
                  >
                    Expiry Date
                  </label>
                  <input
                    type="text"
                    id="expiryDate"
                    name="expiryDate"
                    value={formData.expiryDate}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                    placeholder="MM/YY"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cvv"
                    className="block text-sm font-medium text-gray-600 mb-1"
                  >
                    CVV
                  </label>
                  <input
                    type="text"
                    id="cvv"
                    name="cvv"
                    value={formData.cvv}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200"
                    placeholder="123"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Shopping Basket Section */}
        <div className="flex-1 bg-gray-50 p-6 rounded-xl shadow-inner">
          <h3 className="text-2xl font-extrabold text-gray-800 mb-6 text-center">
            Your Basket
          </h3>
          {basketItems.length === 0 ? (
            <p className="text-center text-gray-500">Your basket is empty.</p>
          ) : (
            <div className="space-y-4">
              {basketItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200"
                >
                  <div className="flex-grow">
                    <p className="font-semibold text-gray-800">{item.name}</p>
                    <p className="text-gray-600 text-sm">
                      ${item.price.toFixed(2)} x {item.quantity}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="ml-4 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50 transition duration-200"
                    aria-label={`Delete ${item.name}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 012 0v6a1 1 0 11-2 0V8z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 pt-4 border-t-2 border-gray-200 flex justify-between items-center">
            <p className="text-xl font-bold text-gray-800">Total:</p>
            <p className="text-xl font-bold text-blue-600">
              ${calculateTotal()}
            </p>
          </div>

          <button
            onClick={handleCheckout}
            className="mt-6 w-full py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition duration-200"
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
```

**4982 token**. At 150 tokens per second just for the response we are looking at 33 seconds to generate the UI, and this is still a relatively simple UI.

Latency is across the full stack and we're going to need a step change in performance to get to the 0.1 second threshold.

There seem to be multiple approaches to improve this performance and reduce latency. On one hand you have [Groq](https://groq.com) making custom hardware and then you have algorithmic changes like [Text Diffusion](https://deepmind.google/models/gemini-diffusion/) (showcased at Google I/O 2025), with both appearing that you show between 1000-2000 tokens per second. The checkout form above would be generated in about 2-3 seconds.

That's an order of magnitude improvement to generation in the space of 2 years, but to get sub-second it looks like need another order of magnitude improvement, so something in the 10,000 tokens per second range.

To me HTML, CSS and JS feel like the right level of abstraction for generating UI inside LLMs, firstly we can generate them for any platform, Web or Native app, but given the languages' relative verbosity it does raise the question to me if it will be better to have an intermediate representation of UI that is more compressed and quicker to generate might be a better approach - for example, I could imaging a constrained set of "[Web Component interfaces](https://paul.kinlan.me/custom-elements-ecosystem/)", or maybe we just use smaller "lower quality" models, or maybe we just wait for another step change to happen in the models and hardware.

To me, the direction of travel is clear. UI generation to service user-goals is going to happen.
