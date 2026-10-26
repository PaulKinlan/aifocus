import "./webmcp.js";
import { initPalette } from "./command-palette.js";

// Ctrl/Cmd+K and the header Search and Ask links open the command palette.
initPalette();

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

