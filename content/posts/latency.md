---
title: latency
date: 2025-05-18T19:59:06.193Z
draft: true
slug: latency
---

- Jacob Nielsen's 100ms rule of thumb is that if a system takes longer than 100ms to respond, it feels like a lag. If it takes longer than 1 second, it feels like a delay. If it takes longer than 10 seconds, the user will give up and go do something else. [link](https://www.nngroup.com/articles/response-times-3-important-limits/) https://www.nngroup.com/articles/response-times-3-important-limits/#:~:text=Limit%20for%20users%20feeling%20that%20they%20are%20directly%20manipulating%20objects%20in%20the%20UI

in /superapps/ I talk about them generating UI to service need.

With `f` - I'm generating functions and UI from english.

But it takes a while. How many tokens per second do you need to be able to get UI created that would feel responsives.

You have to generate HTML, CSS and JS.

a simple form

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

Network request, set up TLS. XX ms

1 second - XXms = remaining time to generate the UI.
