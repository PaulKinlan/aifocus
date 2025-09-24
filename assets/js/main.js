document.addEventListener("DOMContentLoaded", async () => {
  if ("Summarizer" in window) {
    const { Summarizer } = window;
    const availability = await Summarizer.availability();
    if (availability === "unavailable") {
      // keep the summary section hidden
      return;
    }
    const summaryContainer = document.querySelector(".e-summary");

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
