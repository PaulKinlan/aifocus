---
title: Whither CMS?
description:
date: 2025-07-05T21:47:22.638Z
slug: whither-cms
---

When I moved to North Wales I noticed how many of the local businesses were solely on Facebook and Instagram. I spoke to some of them to ask why they don't have a site and it came down to four common issues 1) cost, 2) built in network, 3) skill, and 4) time. It's hard to beat free, good enough, and access to a network of potential customers. At the same time nearly everyone that I spoke to knew it wasn't a perfect situation and they wouldn't say 'no' to their own independent presence.

CMSs offer a path for people without the skill or the time to get their own place on the web, and this is amazing. Yet for many people I spoke to it's still a hurdle to think about what a domain name is (let alone paying for it), how sites should work, and the designs etc. They did know what they wanted their sites to say though (name, address, pictures, booking forms, contact details).

I'm interested in the health of the web and I think that LLMs will help make it significantly easier to create and produce content on the web (and the web is a perfect medium for people to be able to create and share ideas), but what does that mean for CMSs?

I decided to try and do some analysis on the usage of certain tools across the ecosystem and I wanted to see what the adoption is of certain technology stacks such as CMSes and framework mapped against how people use on the web.

It's incredibly hard to get this data publicly so what I am about to show you has a number number of leaps to try and interpret the data. So, without further ado, let's go a leapin'

First up is time spent on the web. [SimilarWeb's ranking of the top 100 sites,](https://pro.similarweb.com/#/digitalsuite/markets/webmarketanalysis/mapping/All/999/3m?webSource=Total) includes both the average time spent and number of navigations per month to each of the top 100 sites. It is the most useful data that I've found and [you can see the number of navigations follows a trend that looks like zipf's-law](https://docs.google.com/spreadsheets/d/18cEessx2d291daGwFBQTIY_MqemTp6dWWQYXf8OSutI/edit?gid=0#gid=0) ([Parse.ly](https://www.parse.ly/zipfs-law-of-the-internet-explaining-online-behavior/) also had a good article from a couple of years ago). SimilarWeb only accounts for the top 100 sites and the web extends out to roughly [350 million origins](https://www.wix.com/blog/how-many-domains-are-there#:~:text=According%20to%20Domain%20Name%20Stat,increase%20from%20Q4%20of%202021.) (as of 2023) so we will have to do some extra work. It won't change the shape of the graph but it will change where we look at where the percentile of navigations happens.

{{< figure src="/images/zipf.png" alt="Navigations predicted using zipf vs SimilarWeb" caption="Navigations predicted using zipf vs SimilarWeb" >}}

{{<aside>}}Navigations are an imperfect measure of internet usage because time is not spent equally on a site especially if you believe Google's goal to get you off the site as quickly as possible against Facebook's goal to keep you on site. It is the best absolute measurement that I can find. {{</aside>}}

_If_ we assume that this distribution is directionally accurate and use SimilarWeb's prediction for the top sites monthly traffic of 83,000,000,000 navigations, then you can compute the estimated monthly traffic for the 2nd most popular site.... Doing this all the way to 360 millionth web site you can infer that roughly 50% of the web's traffic is sent to the top 17 sites. The 75% percentile accounts for 451 sites, 90th percentile 27,219 sites, and 95th percentile is 426,494 sites.

A more traditional way to look at the data is through the Top orders of magnitude. So, the Top 1000 sites accounts for 78.94% of navigations; the Top 10,000 is at 87.38%; Top 10,000 is 92.71% and the Top 1,000,000 is at 96.07%.

Kinda mind blowing think about where people spend their time (I should look at this data over time and see how quickly the web is centralizing).

For completeness, here is the [code](https://gist.github.com/PaulKinlan/a091b7c52f3a7cc43d081cc79f945c63) I used to do the calculation (please feel free to critique the methodology).

```
const alpha = 1.2; // 1.2 seems to map well to top 100 sites... Maybe it works for rest of web?
const size = 360_000_000; // 360 million is the number of sites in the web as of 2023
/*
83 billion is the number of navigations for rank 0 (the most popular site)
for one month in 2025 (yes, I know I don't have the size of the web
for 2025, but this is a good estimate based on current trends).
*/

const max = 83_000_000_000;

// Zipfian based on a known rank and alpha.
const valueAtRank = (valueAt0, rank, alpha) => {
  return valueAt0 / Math.pow(rank, alpha);
};

/*
 Calculate the total number of navigations following a Zipfian distribution.
*/
let sum = 0;

for (let i = 0; i < size; i++) {
  // Value at rank 0 is the max value.
  // Alpha is the Zipfian constant, 1.2 is a good value looking at SimilarWeb
  const value = Math.floor(valueAtRank(max, i + 1, alpha));
  sum += value;

  if (sum > Number.MAX_SAFE_INTEGER) {
    console.warn("Sum exceeded MAX_SAFE_INTEGER, resetting to 0");
    throw new Error("Sum exceeded MAX_SAFE_INTEGER");
  }
}

console.log(`Sum of generated values: ${sum}`);

/*
Calculate the rank at a given percentile.
This function finds the rank that corresponds to a given percentile
based on the cumulative sum of values generated by the Zipfian distribution.
It iterates through ranks, accumulating their values until it reaches the
target value for the specified percentile.
*/
const rankAtPercentile = (percentile, size, sum) => {
  const target = sum * (percentile / 100);
  let cumulativeSum = 0;
  for (let i = 1; i < size; i++) {
    cumulativeSum += valueAtRank(max, i, alpha);
    if (cumulativeSum >= target) {
      return i;
    }
  }
  return size; // If no rank found, return the size as the last rank
};

const percentageAtRank = (rank, sum) => {
  let cumulativeSum = 0;
  for (let i = 1; i < rank; i++) {
    cumulativeSum += valueAtRank(max, i, alpha);
  }
  return (cumulativeSum / sum) * 100;
};

console.log(rankAtPercentile(50, size, sum));
console.log(rankAtPercentile(75, size, sum));
console.log(rankAtPercentile(90, size, sum));
console.log(rankAtPercentile(95, size, sum));

console.log(`Rank 1000 is at ${percentageAtRank(1000, sum)}%`);
console.log(`Rank 10000 is at ${percentageAtRank(10000, sum)}%`);
console.log(`Rank 100000 is at ${percentageAtRank(100000, sum)}%`);
console.log(`Rank 1000000 is at ${percentageAtRank(1000000, sum)}%`);
```

Now that we have some interesting data about how traffic flows around the web, let's see how the sites in the Top _\[insert your order of magnitude here\]_ are built ([Builtwith.com](https://builtwith.com/) and [The Chrome UX technology dashboard](https://httparchive.org/reports/techreport/tech?tech=WordPress,Shopify,Wix,Joomla,Drupal,Squarespace,PrestaShop,Webflow,1C-Bitrix,Tilda&geo=ALL&rank=Top+1k) are an absolute goldmine of useful information.) You can see that [the popular CMSs just aren't used across the top 1000 sites](https://httparchive.org/reports/techreport/tech?tech=WordPress,Shopify,Wix,Joomla,Drupal,Squarespace,PrestaShop,Webflow,1C-Bitrix,Tilda&geo=ALL&rank=Top+1k), and this is confirmed when you dive into builtWith's reports ([Top 1m](https://trends.builtwith.com/cms/), [Wordpress](https://trends.builtwith.com/cms/WordPress), [Drupal,](https://trends.builtwith.com/cms/Drupal) [Joomla](https://trends.builtwith.com/cms/Joomla!), [SquareSpace](https://trends.builtwith.com/cms/Squarespace), [Wix](https://trends.builtwith.com/cms/Wix)). It's often not until you get to the top 1 million sites that you start to see a significant amount of usage in the ecosystem, but the top 1 million sites, is not where the majority of the navigations are.

{{<aside>}}Interestingly, according to builtWith all CMSs have seen a decline in usage across the Top 1m sites since about 2021. Odd.{{</aside>}}

Looking at Wordpress, the most popular site building tool, you do see usage increase in the top 10,000 sites and it clearly grows in popularity through the top 1,000,000, but at some point you have to question stats like "40% of all sites" and realise that it's certainly not 40% of traffic and time spent by people using the web.

It's not until after the top 1,000,000 that you really start to see it's growth in the CMSs. My hunch broadly is that while many of the companies who build CMSes (I struggle with the plural here... CMSi?) will have a few very large sites as customers, the vast majority of customers are the tiny sites that get small amounts of traffic.

{{<aside>}}I need to recognise a potential confirmation bias that I might have here. When I ran a small shared-hosting company we threw more sites on a single server than it could handle if they all got popular, that was because we knew that the vast majority of the customers would get almost 0 traffic. I see the same thinking in the industry today.{{</aside>}}

This is one of the things I love about the web, you can still get found and share you knowledge and build a community even if you are outside of the Top 100,000,000.

Ok ... we are this far in and I've not made my point. Here goes... If you believe that LLMs are going to make it easier for people to build sites, then I think CMSs of today might be in real trouble and will need to adapt.

We're seeing lots of new tools coming up where the idea is that you can build a site just by describing what you want to do, whether that's [loveable](https://lovable.dev/), [Stitch](https://stitch.withgoogle.com/) or any of the other hundreds of tools that are coming out. Heck, even I built a tool as an experiment with generative site building: [makemy.blog](http://makemy.blog). There are also tools or Canvas' being built into the Chat clients that enable you to experiment with a site design and share it with friends, and then there are tools like [AI Studio](https://youtu.be/GjvgtwSOCao) or [Claude Artifacts](https://www.anthropic.com/news/claude-powered-artifacts) that will build simple sites and let put them on the public web instantly.

The great thing about these types of tools is that you can just try it, iterate on it and get a design or layout or style that is unique to you and you don't feel stupid for just trying things and you don't have to spend any money. Many of the people that I spoke to about their Facebook presence know what they want on a site, it's just that it's instant and simple on Facebook (and you get instant reach and distribution) where as on the web, you would frequently have to sign up for a service, pick one of the generic stock-templates, enter your credit card... urgh.

The sheer fact that as a regular person you can describe the type of site you want to get on the web and what data it will show, is incredible, so much so that I think we are going to see an explosion in tools that can create compelling looking sites and experiences and just let normal web users design and iterate.

Are these generated sites the most beautiful and creative representation of the web? No, not yet. Are they better than being hosted in a walled garden? 100%! This is a massive positive for the web. The Web has always been easier to build for than native platforms, but it's never been as easy as posting your presence on Facebook. CMS's made it easier and I believe that Canvas' or the new breed of web-design tools are going to massively lower the cost and complexity of getting a good web presence online.

So where do the current CMSs and hosting platforms innovate?

I think it's tough. For a huge number of sites, where it's a person's local small business then people don't need the full suite of services that CMSs and hosted CMSs offer, but in a lot of cases that is what they have to pick.

The new crop of tooling is showing that you can quickly iterate on designs that are custom and personal to each individual, so I think there will need to be a move away from the cookie-cutter theme templates and enable people to personalise their own experiences instantly.

I can also imagine improvements to instant iteration on entire site design and smoothing out the ability to experiment for free. I don't know the usage of [WordPress Playground](https://wordpress.org/playground/), but my own experience with it is that I can get a feel for how everything works in wordpress without having to subscribe to any service, or give my credit-card (or any of the other things companies do to try and get you to convert into a paying customer).

Price is one area that I hope there is a lot of competition. It's one of the biggest reasons I hear for people not to put a presence online. Yes there are issues today with [tokens](/token-slinging/) as a unit of cost, but the costs of generation are coming down. At the same time the [latency](https://aifoc.us/latency/) is improving so much that it's not just the cost of running the service, the cost to the person using the tool drops dramatically (I can try 10 designs in an hour vs 1 in an evening)

Domain names might also be another opportunity for improvement a the recurring annual cost and a point of confusion for many people.

I'm not in the CMS business directly, so you can see that I'm short of specific ideas, other than I think we are going to see a lot more competition coming through and that I think this is good for the industry... mostly....

I'd love to get your thoughts on the state of the CMS ecosystem and where you think the opportunities are. [Hit me up](mailto:paul@aifoc.us)! For a future edition of aifoc.us, I think there will be a knock-on effect to the agencies that service small businesses so I'm starting to think about how the Agency ecosystem be impacted and maybe where it needs to change.

---

_Thank you to Terry Pollard spotting a number of typos and errors in this post._
