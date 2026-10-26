// Renders one essay result (title, date, snippet or summary) for the /search/
// and /ask/ pages.

export const formatDate = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
};

export const renderResult = (result) => {
  const item = document.createElement("li");
  item.className = "search-result";

  const heading = document.createElement("h2");
  const link = document.createElement("a");
  link.href = result.url;
  link.textContent = result.title;
  heading.append(link);

  const meta = document.createElement("p");
  meta.className = "search-result-date";
  const time = document.createElement("time");
  time.dateTime = result.date;
  time.textContent = formatDate(result.date);
  meta.append(time);

  item.append(heading, meta);

  const excerpt = result.snippet || result.summary;
  if (excerpt) {
    const body = document.createElement("p");
    body.className = "search-result-snippet";
    body.textContent = excerpt;
    item.append(body);
  }
  return item;
};
