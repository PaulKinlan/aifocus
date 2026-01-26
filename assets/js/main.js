// Lightbox: click figure images to expand via popover
document.addEventListener("click", (e) => {
  const img = e.target.closest("figure img");
  if (!img || img.matches(":popover-open")) return;
  img.popover = "auto";
  img.addEventListener("toggle", (e) => {
    if (e.newState === "closed") img.removeAttribute("popover");
  }, { once: true });
  img.showPopover();
});

document.addEventListener("DOMContentLoaded", async () => {
  if ("Summarizer" in window) {
    const { Summarizer } = window;
    const availability = await Summarizer.availability();
    if (availability === "unavailable") {
      // keep the summary section hidden
      return;
    }
    const summaryContainer = document.querySelector(".e-summary");
    summaryContainer.classList.add("visible");

    const summaryElementInitialText = "Expand to see summary";
    let summary = summaryElementInitialText;
    const summaryElement = summaryContainer.querySelector("summary");

    summaryContainer
      .querySelector("details")
      .addEventListener("toggle", async (event) => {
        const details = event.target;

        if (summary !== summaryElementInitialText) {
          return;
        }

        if (details.open) {
          const summarizer = await Summarizer.create({
            type: "tldr",
            format: "plain-text",
            length: "medium",
            expectedInputLanguages: ["en", "en-GB", "en-US"],
            moitor: (m) => {
              m.addEventListener("downloadprogress", (e) => {
                summaryElement.textContent = `Downloading model... ${Math.round(
                  e.loaded * 100
                )}%`;
              });
            },
          });

          details.removeEventListener("toggle", this);

          summaryElement.textContent = "Generating Summary on device...";

          const summaryStream = await summarizer.summarizeStreaming(
            document.querySelector(".e-content").innerText
          );

          //summaryElement.textContent = "";

          let first = true;
          for await (const chunk of summaryStream) {
            if (first) {
              summaryElement.textContent = "";
              first = false;
            }
            summaryElement.textContent += chunk;
            summary += chunk;
          }
        }
      });

    summaryContainer.style.display = "block";
  }
});

// Share functionality
document.addEventListener("DOMContentLoaded", function() {
  // Check if Navigator.share is supported
  if (navigator.share) {
    const nativeShareButton = document.querySelector(".share-native");
    if (nativeShareButton) {
      nativeShareButton.style.display = "inline-flex";
      nativeShareButton.addEventListener("click", async function() {
        try {
          await navigator.share({
            title: document.title,
            url: window.location.href
          });
        } catch (err) {
          // User cancelled or share failed
          console.log("Share failed or was cancelled:", err);
        }
      });
    }
  }
  
  // Mastodon share - prompt for instance
  const mastodonButton = document.querySelector(".share-mastodon");
  if (mastodonButton) {
    mastodonButton.addEventListener("click", function() {
      const url = this.getAttribute("data-url");
      const title = this.getAttribute("data-title");
      const text = encodeURIComponent(`${title} ${url}`);
      
      // Prompt user for their Mastodon instance
      const instance = prompt("Enter your Mastodon instance (e.g., mastodon.social):");
      if (instance) {
        // Clean and validate the instance URL
        const cleanInstance = instance.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
        
        // Basic validation: check if it looks like a valid domain
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (cleanInstance && domainRegex.test(cleanInstance)) {
          window.open(
            `https://${cleanInstance}/share?text=${text}`,
            "_blank",
            "noopener,noreferrer"
          );
        } else {
          alert("Please enter a valid Mastodon instance domain (e.g., mastodon.social)");
        }
      }
    });
  }
});

