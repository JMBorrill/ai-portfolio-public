// Reviewed derivatives of the captures in references/assets/, served from public/projects/.
// Captions state what each capture is and is not; alt text describes what it shows.

export type Media = {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  alt: string;
  caption: string;
};

const aiws = "/projects/ai-workflow-studio";
const qrs = "/projects/quant-research-studio";

export const media = {
  aiwsWorkspace: {
    src: `${aiws}/workspace-1600.webp`,
    srcSet: `${aiws}/workspace-960.webp 960w, ${aiws}/workspace-1600.webp 1600w`,
    width: 1600,
    height: 1000,
    alt: "AI Workflow Studio in its dark theme. A sidebar lists the workflow steps from Website enquiry to Reply queued, the canvas shows the connected step graph, and the right-hand panel shows a fixture run waiting for approval of a drafted reply to Priya Shah of Northwind Logistics.",
    caption:
      "A fixture run of the lead qualification workflow, paused at its approval step. Fixture runs replay recorded model and tool responses: no model was called and nothing was sent. Example-domain data; an earlier capture, not the latest build.",
  },
  aiwsApproval: {
    src: `${aiws}/approval-838.webp`,
    width: 838,
    height: 766,
    alt: "Approval panel titled “Send this reply?”: Priya Shah (Northwind Logistics) scored 88/100 (hot, automation_project). Below are the recipient address, the subject “Automating your invoice entry into Xero” and the drafted reply.",
    caption:
      "Detail from the same capture: the score, recipient and draft a person reviews before the reply can be queued.",
  },
  qrsWorkspace: {
    src: `${qrs}/workspace-1600.webp`,
    srcSet: `${qrs}/workspace-960.webp 960w, ${qrs}/workspace-1600.webp 1600w`,
    width: 1600,
    height: 1000,
    alt: "The backtesting platform in its dark theme. An operator palette on the left; a strategy graph in the centre connecting a dataset to fast and slow EMAs, crossover signals, a long/flat position and a backtest; a run summary on the right with metrics and an equity chart.",
    caption:
      "An EMA crossover strategy with a completed run on synthetic data. The figures describe a synthetic test, not investment performance. Capture of an earlier demo build; the current research interface differs.",
  },
  qrsGraph: {
    src: `${qrs}/graph-1512.webp`,
    width: 1512,
    height: 430,
    alt: "Strategy graph: dataset bars feed a fast EMA (warm-up 19) and a slow EMA (warm-up 49). Two Cross operators turn them into cross-up and cross-down signals, which drive a Long / flat position. The positions and the bars feed a Backtest.",
    caption:
      "Detail: every node is a registered, versioned operator, and each shows the warm-up it needs before producing values.",
  },
  qrsResults: {
    src: `${qrs}/results-838.webp`,
    width: 838,
    height: 1267,
    alt: "Run panel: valid, compiled code d8fad9fae5a1. A run at revision 1 succeeded with code d8fad9fae5a1 and result 24357159ece3. Evidence: synthetic, the weakest class among the datasets this run read. Metrics include net P&L −1,620.00, return −1.62% and maximum drawdown 1.76%.",
    caption:
      "Detail: each run records its compiled-code and result identifiers and the weakest evidence class among the data it read. The synthetic run lost money; it is shown as captured.",
  },
  charityHome: {
    src: "/projects/charity-website/home-1600.webp",
    srcSet: "/projects/charity-website/home-960.webp 960w, /projects/charity-website/home-1600.webp 1600w",
    width: 1600,
    height: 1000,
    alt: "A charity website’s home page. A dark bar reads “In danger now? Call 999” beside a Leave this site link; below are the Example Trust wordmark, navigation, a demonstration-site banner, the heading “Support that works for you”, and two cards: Domestic abuse support and The Uniform Swap Project.",
    caption: "The home page of the demo build. The charity’s name, people, places and projects are replaced with fictional ones, and its photographs with placeholders.",
  },
  footballHome: {
    src: "/projects/schools-football/home-1600.webp",
    srcSet: "/projects/schools-football/home-960.webp 960w, /projects/schools-football/home-1600.webp 1600w",
    width: 1600,
    height: 1000,
    alt: "A schools football association’s home page under a demonstration banner: the Millbrook Schools Football Association heading, cards for Boys and Girls competitions with links to fixtures, results, league tables and cup draws, a District card and recent announcements.",
    caption: "The home page of the demo build, with the app’s own fictional schools, fixtures and results. The association’s name and badges are replaced with fictional ones.",
  },
  criteriaAnswer: {
    src: "/projects/criteria-chat/answer-1600.webp",
    srcSet: "/projects/criteria-chat/answer-960.webp 960w, /projects/criteria-chat/answer-1600.webp 1600w",
    width: 1600,
    height: 1000,
    alt: "Criteria Chat answering “Compare CCJ policy for Northgate Core and Kestrel Flex”. Under a fictional-data banner, each product’s policy is quoted from its lender’s guide, marked documented or conditional, with the guide’s name and a View source button.",
    caption: "An answer from the demo build, on the app’s fictional lenders: every statement is quoted from a cited source, and a policy that depends on conditions says so.",
  },
  satelliteCard: {
    src: "/projects/satellite-intelligence-lab/card-1600.webp",
    width: 1600,
    height: 768,
    alt: "Two false-colour satellite images of the same 6 km square in Texas. Left, June 2019: green farmland either side of a highway. Right, August 2024: a very large rectangular building, car parks and pale cleared ground in the centre.",
    caption:
      "Tesla Gigafactory Texas in Sentinel-2 imagery, June 2019 (left) and August 2024 (right): a 6 km square in false colour. Contains modified Copernicus Sentinel data 2019 and 2024.",
  },
} satisfies Record<string, Media>;
