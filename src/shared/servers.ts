// Public webtiles servers shown in the launcher. Players can also add their own URL.
// Server list maintained by the community: https://crawl.develz.org/wordpress/howto

export interface Server {
  id: string;
  name: string;
  url: string;
  region: string;
}

export const SERVERS: readonly Server[] = [
  { id: "cao", name: "crawl.akrasiac.org", url: "http://crawl.akrasiac.org:8080/", region: "North America" },
  { id: "cdi", name: "crawl.dcss.io", url: "https://crawl.dcss.io/", region: "North America" },
  { id: "cnc", name: "crawl.nemelex.cards", url: "https://crawl.nemelex.cards/", region: "Asia" },
  { id: "cxc", name: "crawl.xtahua.com", url: "https://crawl.xtahua.com/", region: "Europe" },
  { id: "cue", name: "underhound.eu", url: "https://underhound.eu:8080/", region: "Europe" },
  { id: "cpo", name: "crawl.project357.org", url: "https://crawl.project357.org/", region: "Australia" },
];
