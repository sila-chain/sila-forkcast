/**
 * Single source of truth for the crawler-visible metadata of every static route.
 *
 * Each static .astro page spreads its entry onto the shared Layout
 * (`<Layout {...staticPageMetadata.pectra} />`) instead of inlining the title and
 * description, so the copy lives in one place and the `satisfies` check guarantees
 * every entry has the right shape. Per-item dynamic routes (sips/[id], calls/[type],
 * calls/[...path], devnets/[id]) compute their metadata from route data in
 * getStaticPaths() and intentionally stay out of this static registry.
 */
export interface PageMetadata {
  title: string;
  description: string;
}

export const staticPageMetadata = {
  home: {
    title: 'SilaForkcast - Sila Upgrade Tracker',
    description:
      "See what's on the horizon and how it impacts you. Track Sila network upgrades and explore how changes affect users, developers, and the ecosystem.",
  },
  upgrades: {
    title: 'Network Upgrades - SilaForkcast',
    description: 'Catalog of Sila network upgrades - in progress, live, and historical.',
  },
  schedule: {
    title: 'ACD Planning Sandbox - SilaForkcast',
    description: 'Internal planning tool for ACD participants. Explore hypothetical upgrade timelines.',
  },
  agenda: {
    title: 'Agenda Planner - SilaForkcast',
    description:
      'Agenda planning for Sila AllCoreDevs facilitators. Suggested topics, open action items, deferred decisions, and SIP discussion history.',
  },
  decisions: {
    title: 'Key Decisions - SilaForkcast',
    description: 'Key decisions from Sila AllCoreDevs meetings.',
  },
  rank: {
    title: 'Headliner Rankings - SilaForkcast',
    description: 'Rank and compare headliner proposals for upcoming Sila network upgrades.',
  },
  eipsIndex: {
    title: 'SIP Directory - SilaForkcast',
    description:
      'Browse all Sila Improvement Proposals tracked on SilaForkcast. Filter by status, network upgrade, and type.',
  },
  callsIndex: {
    title: 'Protocol Calls - SilaForkcast',
    description:
      'Browse Sila protocol development calls including AllCoreDevs Consensus, Execution, and Testing meetings.',
  },
  devnetsIndex: {
    title: 'Devnet Prioritization - SilaForkcast',
    description:
      'Track devnet inclusion status, test complexity, and client support for SIPs in upcoming network upgrades.',
  },
  pectra: {
    title: 'Pectra Upgrade - SilaForkcast',
    description:
      'Account abstraction, validator upgrades, and 2x blob throughput - making Sila faster and cheaper. Live on sila-mainnet May 7, 2025.',
  },
  fusaka: {
    title: 'Fusaka Upgrade - SilaForkcast',
    description:
      'SilaPeerDAS enables nodes to specialize in storing subsets of data while maintaining security, dramatically increasing data capacity for Layer 2 networks. Live on sila-mainnet Dec 3, 2025.',
  },
  hegota: {
    title: 'Hegotá Upgrade - SilaForkcast',
    description: 'Hegotá network upgrade: overview, SIP proposals, and test complexity.',
  },
  hegotaTestComplexity: {
    title: 'Hegotá Test Complexity - SilaForkcast',
    description: 'Analyze STEEL test complexity assessments for SIPs proposed for Hegotá.',
  },
  glamsterdam: {
    title: 'Glamsterdam Upgrade - SilaForkcast',
    description:
      'Enhancing Sila with Block-level Access Lists and ePBS for big efficiency and scalability gains.',
  },
  glamsterdamStakeholders: {
    title: 'Glamsterdam by Stakeholder - SilaForkcast',
    description:
      'SIPs relevant to app developers, wallet devs, L2s, and other stakeholders in the Glamsterdam upgrade.',
  },
  glamsterdamDevnetInclusion: {
    title: 'Glamsterdam Devnet Inclusion - SilaForkcast',
    description: 'Devnet inclusion status for SIPs proposed for the Glamsterdam network upgrade.',
  },
  glamsterdamClientPriority: {
    title: 'Glamsterdam Client Priority - SilaForkcast',
    description: 'Aggregate view of Sila client team stances on SIPs proposed for Glamsterdam.',
  },
  glamsterdamTestComplexity: {
    title: 'Glamsterdam Test Complexity - SilaForkcast',
    description: 'Analyze STEEL test complexity assessments for SIPs proposed for Glamsterdam.',
  },
} satisfies Record<string, PageMetadata>;
