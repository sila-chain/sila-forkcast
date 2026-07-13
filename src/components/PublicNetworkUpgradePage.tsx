import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from './navigation';
import { eipsData } from '../data/sips';
import { getPendingProposalsForFork } from '../data/pending-proposals';
import { useAnalytics } from '../hooks/useAnalytics';
import { SIP, ClientTeamPerspective, InclusionStage } from '../types';
import {
  getInclusionStage,
  isHeadliner,
  getLaymanTitle,
  getProposalPrefix,
  getSpecificationUrl,
  getSummaryDescription,
  wasHeadlinerCandidate,
  isUnselectedHeadlinerCandidate,
  sortByLayer,
  getEipIdFromHash,
  getUpgradeAnchorExpansionState,
  getEipLayer
} from '../utils';
import {
  getInclusionStageColor,
  getUpgradeStatusColor
} from '../utils/colors';
import { ActivationDetails } from '../data/upgrades';
import { Tooltip, CopyLinkButton } from './ui';
import {
  NetworkUpgradeTimeline,
  FusakaTimeline,
  GlamsterdamTimeline,
  HegotaTimeline,
  PectraTimeline,
  TableOfContents,
  EipFilterBar,
  OverviewSection,
  ClientPerspectives,
  EipCard
} from './network-upgrade';

// Upgrade page display modes control which sections are visible.
// headlinerSelection hides the overview and stage-grouped SIP sections.
type UpgradePageMode = 'default' | 'headlinerSelection';

const getUpgradePageMode = (forkName: string): UpgradePageMode => {
  // Keep per-fork mode overrides as data so future forks can opt into a mode in one place.
  const upgradePageModeByFork: Partial<Record<string, UpgradePageMode>> = {};
  return upgradePageModeByFork[forkName.toLowerCase()] ?? 'default';
};

const normalizeFilterParams = (
  params: URLSearchParams,
  showLayerFilter: boolean,
  nextLayer: 'all' | 'EL' | 'CL',
  nextQuery: string
) => {
  const next = new URLSearchParams(params);

  if (!showLayerFilter || nextLayer === 'all') {
    next.delete('layer');
  } else {
    next.set('layer', nextLayer);
  }

  if (!nextQuery.trim()) {
    next.delete('filter');
  } else {
    next.set('filter', nextQuery);
  }

  return next;
};

const ANCHOR_SCROLL_GAP = 24;

const getAnchorScrollOffset = () => {
  const stickyHeader = document.querySelector('header.sticky');
  if (!(stickyHeader instanceof HTMLElement)) {
    return 80;
  }

  return stickyHeader.getBoundingClientRect().height + ANCHOR_SCROLL_GAP;
};

const scrollToElement = (element: HTMLElement, behavior: ScrollBehavior = 'smooth') => {
  const top = element.getBoundingClientRect().top + window.scrollY - getAnchorScrollOffset();
  window.scrollTo({ top, behavior });
};

interface PublicNetworkUpgradePageProps {
  forkName: string;
  displayName: string;
  description: string;
  status: string;
  activationDate?: string;
  metaEipLink?: string;
  clientTeamPerspectives?: ClientTeamPerspective[];
  activationDetails?: ActivationDetails;
  /** When true, omit the standalone "All Network Upgrades" back-link for embedding inside a layout. */
  embedded?: boolean;
  /** When true, also omit the header section (title, description, meta-sip link). */
  skipHeader?: boolean;
}

const PublicNetworkUpgradePage: React.FC<PublicNetworkUpgradePageProps> = ({
  forkName,
  displayName,
  description,
  status,
  activationDate,
  metaEipLink,
  clientTeamPerspectives,
  activationDetails,
  embedded = false,
  skipHeader = false
}) => {
  // Determine display mode for this upgrade page
  const pageMode = getUpgradePageMode(forkName);
  const showLayerFilter = pageMode === 'headlinerSelection' || forkName.toLowerCase() === 'glamsterdam' || forkName.toLowerCase() === 'hegota';
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const layerParam = searchParams.get('layer');
  const layerFilter: 'all' | 'EL' | 'CL' =
    showLayerFilter && (layerParam === 'EL' || layerParam === 'CL') ? layerParam : 'all';
  const searchQuery = searchParams.get('filter') ?? '';
  const hasActiveFilter = searchQuery.trim().length > 0 || layerFilter !== 'all';

  const [sips, setEips] = useState<SIP[]>([]);
  const [activeSection, setActiveSection] = useState<string>('overview');
  const [isDeclinedExpanded, setIsDeclinedExpanded] = useState(false);
  const lastScrolledHashRef = useRef<string | null>(null);
  // In headlinerSelection mode, expand by default since it's the main content
  const [isHeadlinerProposalsExpanded, setIsHeadlinerProposalsExpanded] = useState(pageMode === 'headlinerSelection');

  // Ensure headliner proposals are expanded when entering headlinerSelection mode
  useEffect(() => {
    if (pageMode === 'headlinerSelection') {
      setIsHeadlinerProposalsExpanded(true);
    }
  }, [pageMode]);
  const { trackUpgradeView, trackLinkClick } = useAnalytics();

  const updateFilterParams = (nextLayer: 'all' | 'EL' | 'CL', nextQuery: string) => {
    const nextParams = normalizeFilterParams(searchParams, showLayerFilter, nextLayer, nextQuery);
    const nextSearch = nextParams.toString();

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
        hash: location.hash,
      },
      { replace: true }
    );
  };

  const handleLayerFilterChange = (filter: 'all' | 'EL' | 'CL') => {
    updateFilterParams(filter, searchQuery);
  };

  const handleSearchChange = (query: string) => {
    updateFilterParams(layerFilter, query);
  };

  const getAnchorExpansionForHash = useCallback(() => {
    const anchorEipId = getEipIdFromHash(location.hash);
    if (anchorEipId === null) return null;

    const anchorEip = sips.find(sip => sip.id === anchorEipId);
    if (!anchorEip) return null;

    return getUpgradeAnchorExpansionState(anchorEip, forkName);
  }, [sips, forkName, location.hash]);

  const isAnchorExpansionApplied = useCallback(() => {
    const expansion = getAnchorExpansionForHash();
    if (!expansion) return true;

    return (
      (!expansion.declined || isDeclinedExpanded) &&
      (!expansion.headlinerProposals || isHeadlinerProposalsExpanded)
    );
  }, [getAnchorExpansionForHash, isDeclinedExpanded, isHeadlinerProposalsExpanded]);

  // Filter SIPs that have relationships with this fork
  useEffect(() => {
    const filteredEips = eipsData.filter(sip =>
      sip.forkRelationships.some(fork =>
        fork.forkName.toLowerCase() === forkName.toLowerCase()
      )
    );
    setEips(filteredEips);
  }, [forkName]);

  // Track upgrade view
  useEffect(() => {
    trackUpgradeView(forkName);
  }, [forkName, trackUpgradeView]);

  // Scroll to top when navigating to page (unless there's a hash)
  useEffect(() => {
    if (!location.hash) {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, location.hash]);

  // Expand collapsed sections before scrolling to an SIP anchor inside them.
  useLayoutEffect(() => {
    const expansion = getAnchorExpansionForHash();
    if (!expansion) return;

    if (expansion.declined) {
      setIsDeclinedExpanded(true);
    }
    if (expansion.headlinerProposals) {
      setIsHeadlinerProposalsExpanded(true);
    }
  }, [getAnchorExpansionForHash]);

  // Scroll after any required anchor expansion has rendered.
  useLayoutEffect(() => {
    const hash = location.hash.substring(1); // Remove the # symbol
    if (!hash) {
      lastScrolledHashRef.current = null;
      return;
    }

    if (!isAnchorExpansionApplied()) {
      return;
    }

    const element = document.getElementById(hash);
    if (!element) {
      return;
    }

    const scrollKey = `${location.pathname}${location.search}${location.hash}`;
    if (lastScrolledHashRef.current === scrollKey) {
      return;
    }

    scrollToElement(element, 'auto');
    setActiveSection(hash);
    lastScrolledHashRef.current = scrollKey;
  }, [location.pathname, location.search, location.hash, sips, isAnchorExpansionApplied]);

  // Intersection Observer for TOC
  useEffect(() => {
    // Track all currently visible sections
    const visibleSections = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleSections.add(entry.target.id);
          } else {
            visibleSections.delete(entry.target.id);
          }
        });

        // Find the visible section closest to the top of the viewport
        if (visibleSections.size > 0) {
          let closestSection: string | null = null;
          let closestDistance = Infinity;

          visibleSections.forEach((id) => {
            const element = document.getElementById(id);
            if (element) {
              const rect = element.getBoundingClientRect();
              // Use the distance from the top of the viewport
              const distance = Math.abs(rect.top);
              if (distance < closestDistance) {
                closestDistance = distance;
                closestSection = id;
              }
            }
          });

          if (closestSection) {
            setActiveSection(closestSection);
          }
        }
      },
      {
        threshold: 0.1,
        rootMargin: '-10% 0px -70% 0px'
      }
    );

    // Observe all section elements
    const sections = document.querySelectorAll('[data-section]');
    sections.forEach((section) => observer.observe(section));

    return () => {
      sections.forEach((section) => observer.unobserve(section));
    };
  }, [sips]);

  // Filter SIPs by layer
  const filterEipsByLayer = (eipsList: SIP[]) => {
    if (layerFilter === 'all') return eipsList;
    return eipsList.filter(sip => getEipLayer(sip) === layerFilter);
  };

  // Filter SIPs by search query
  const filterEipsBySearch = (eipsList: SIP[]) => {
    if (!searchQuery.trim()) return eipsList;
    const query = searchQuery.toLowerCase().trim();
    return eipsList.filter(sip => {
      const proposalPrefix = getProposalPrefix(sip);
      const laymanTitle = getLaymanTitle(sip);
      const searchableText = `${proposalPrefix}-${sip.id} ${sip.title} ${laymanTitle}`.toLowerCase();
      return searchableText.includes(query);
    });
  };

  // Combined filter function
  const filterEips = (eipsList: SIP[]) => {
    return filterEipsBySearch(filterEipsByLayer(eipsList));
  };

  const isEipRenderedInStageSections = (sip: SIP) => {
    if (pageMode === 'headlinerSelection') return false;

    const displayedStages = status === 'Live'
      ? ['Included', 'Declined for Inclusion']
      : ['Included', 'Scheduled for Inclusion', 'Considered for Inclusion', 'Proposed for Inclusion', 'Declined for Inclusion'];
    const stage = getInclusionStage(sip, forkName);

    if (!displayedStages.includes(stage)) return false;
    if (forkName.toLowerCase() === 'glamsterdam' && isUnselectedHeadlinerCandidate(sip, forkName)) {
      return false;
    }

    return filterEips([sip]).length > 0;
  };

  // Helper to generate Headliner Proposals TOC items
  const getHeadlinerProposalsTocItems = (includeIndividualItems: boolean = false) => {
    const headlinerProposals = filterEipsByLayer(sips.filter(sip => wasHeadlinerCandidate(sip, forkName)));
    const pendingProposals = getPendingProposalsForFork(forkName)
      .filter(p => layerFilter === 'all' || p.layer === layerFilter);
    const totalCount = headlinerProposals.length + pendingProposals.length;

    if (totalCount === 0) return [];

    // For default mode (Glamsterdam), just show the section header
    if (!includeIndividualItems) {
      return [
        { id: 'headliner-proposals', label: 'Headliner Proposals', type: 'section' as const, count: totalCount }
      ];
    }

    // For headlinerSelection mode, show individual items
    const headlinerItems = headlinerProposals
      .sort((a, b) => {
        const layerSort = sortByLayer({ layer: getEipLayer(a) }, { layer: getEipLayer(b) });
        if (layerSort !== 0) return layerSort;
        return a.id - b.id;
      })
      .map(sip => {
        const proposalPrefix = getProposalPrefix(sip);
        const layer = getEipLayer(sip);
        return {
          id: `sip-${sip.id}`,
          label: `☆ ${proposalPrefix}-${sip.id}: ${getLaymanTitle(sip)}`,
          type: 'sip' as const,
          count: null as number | null,
          layer: layer as 'EL' | 'CL' | null
        };
      });

    const pendingItems = pendingProposals
      .sort((a, b) => {
        const layerSort = sortByLayer(a, b);
        if (layerSort !== 0) return layerSort;
        return a.title.localeCompare(b.title);
      })
      .map(proposal => ({
        id: `pending-${proposal.id}`,
        label: `☆ ${proposal.title}`,
        type: 'sip' as const,
        count: null as number | null,
        layer: proposal.layer as 'EL' | 'CL' | null
      }));

    return [
      { id: 'headliner-proposals', label: 'Headliner Proposals', type: 'section' as const, count: totalCount },
      ...headlinerItems,
      ...pendingItems
    ];
  };

  // Generate TOC items based on pageMode
  const tocItems = [
    // Overview - always shown
    { id: 'overview', label: 'Overview', type: 'section' as const, count: null as number | null },

    // Add timeline section for forks that have one
    ...(['glamsterdam', 'fusaka', 'pectra', 'hegota'].includes(forkName.toLowerCase()) ? [
      { id: `${forkName.toLowerCase()}-timeline`, label: 'Timeline', type: 'section' as const, count: null as number | null }
    ] : []),

    // Headliner Proposals section - for headlinerSelection mode, show at top (after timeline) with individual items
    ...(pageMode === 'headlinerSelection' ? getHeadlinerProposalsTocItems(true) : []),

    // SIP stage sections - hidden in headlinerSelection mode
    ...(pageMode !== 'headlinerSelection' ? [
      ...(status === 'Live'
        ? ['Included', 'Declined for Inclusion']
        : ['Included', 'Scheduled for Inclusion', 'Considered for Inclusion', 'Proposed for Inclusion', 'Declined for Inclusion']
      ).flatMap(stage => {
          // For Glamsterdam, exclude unselected headliner candidates from stage sections since they have their own section
          // Selected headliners (isHeadliner=true) should still appear in their respective stages
          let stageEips = sips.filter(sip => {
            const matchesStage = getInclusionStage(sip, forkName) === stage;
            if (forkName.toLowerCase() === 'glamsterdam') {
              return matchesStage && !isUnselectedHeadlinerCandidate(sip, forkName);
            }
            return matchesStage;
          });

          // Apply layer filter
          stageEips = filterEipsByLayer(stageEips);

          if (stageEips.length === 0) return [];

          // Sort SIPs: headliners first, then by SIP number
          const sortedEips = stageEips.sort((a, b) => {
            const aIsHeadliner = isHeadliner(a, forkName);
            const bIsHeadliner = isHeadliner(b, forkName);

            // If one is headliner and other isn't, headliner comes first
            if (aIsHeadliner && !bIsHeadliner) return -1;
            if (!aIsHeadliner && bIsHeadliner) return 1;

            // If both are same type (both headliner or both not), sort by SIP number
            return a.id - b.id;
          });

          const stageItem = {
            id: stage.toLowerCase().replace(/\s+/g, '-'),
            label: stage,
            type: 'section' as const,
            count: stageEips.length
          };

          // For Declined for Inclusion, only show the section header, not individual SIPs
          if (stage === 'Declined for Inclusion') {
            return [stageItem];
          }

          // For all other stages, show individual SIPs
          const eipItems = sortedEips.map(sip => {
            const isHeadlinerEip = isHeadliner(sip, forkName);
            const inclusionStage = getInclusionStage(sip, forkName);
            const isSFI = inclusionStage === 'Scheduled for Inclusion';

            // Use filled star for SFI SIPs, empty star for other headliners in Glamsterdam
            const starSymbol = forkName.toLowerCase() === 'glamsterdam'
              ? (isSFI ? '★' : '☆')
              : '★';

            const proposalPrefix = getProposalPrefix(sip);
            const layer = getEipLayer(sip);

            return {
              id: `sip-${sip.id}`,
              label: `${isHeadlinerEip ? `${starSymbol} ` : ''}${proposalPrefix}-${sip.id}: ${getLaymanTitle(sip)}`,
              type: 'sip' as const,
              count: null as number | null,
              layer: layer as 'EL' | 'CL' | null
            };
          });

          return [stageItem, ...eipItems];
        }),
    ] : []),

    // Headliner Proposals section - for default mode (like Glamsterdam), show at bottom
    ...(pageMode !== 'headlinerSelection' && (forkName.toLowerCase() === 'glamsterdam' || forkName.toLowerCase() === 'hegota') ? getHeadlinerProposalsTocItems() : []),
  ];

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      scrollToElement(element);
      // Update URL hash
      window.history.pushState(null, '', `#${sectionId}`);
      setActiveSection(sectionId);
    }
  };

  const handleExternalLinkClick = (linkType: string, url: string) => {
    trackLinkClick(linkType, url);
  };

  const content = (
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          {!embedded && (
            <Link to="/upgrades" className="text-slate-600 hover:text-slate-800 dark:text-slate-300 dark:hover:text-slate-100 mb-6 inline-block text-sm font-medium">
              ← All Network Upgrades
            </Link>
          )}

          {!skipHeader && (
          <div className="border-b border-slate-200 dark:border-slate-700 pb-8">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between lg:justify-start gap-3 mb-3">
                  <h1 className="text-3xl font-light text-slate-900 dark:text-slate-100 tracking-tight">
                    <span className="lg:hidden">{displayName.replace(/ Upgrade$/, '')}</span>
                    <span className="hidden lg:inline">{displayName}</span>
                  </h1>
                  <span className={`lg:hidden px-3 py-1 text-xs font-medium rounded ${getUpgradeStatusColor(status)}`}>
                    {status}
                  </span>
                  <div className="hidden lg:flex items-center">
                    <CopyLinkButton
                      sectionId="upgrade"
                      title="Copy link to this upgrade"
                    />
                  </div>
                </div>
                <p className="text-base text-slate-600 dark:text-slate-300 mb-2 leading-relaxed max-w-2xl">{description}</p>
                {metaEipLink && (
                  <div className="mb-4">
                    <a
                      href={metaEipLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleExternalLinkClick('meta_eip_discussion', metaEipLink)}
                      className="inline-flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 underline decoration-1 underline-offset-2 transition-colors"
                    >
                      View Meta SIP Discussion
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
              <div className="hidden lg:block">
                <span className={`px-3 py-1 text-xs font-medium rounded ${getUpgradeStatusColor(status)}`}>
                  {status}
                </span>
              </div>
            </div>

          </div>
          )}
        </div>

        <NetworkUpgradeTimeline currentForkName={forkName} />

        {/* Mobile-only filter bar — the desktop sidebar (lg+) handles this */}
        <div className="lg:hidden mb-4">
          <EipFilterBar
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            layerFilter={layerFilter}
            onLayerFilterChange={handleLayerFilterChange}
            showLayerFilter={showLayerFilter}
            matchCount={filterEips(sips).length}
            totalEipCount={filterEipsByLayer(sips).length}
          />
        </div>

        <div className="flex gap-8">
          <TableOfContents
            items={tocItems}
            activeSection={activeSection}
            onSectionClick={scrollToSection}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            layerFilter={layerFilter}
            onLayerFilterChange={handleLayerFilterChange}
            showLayerFilter={showLayerFilter}
          />

          <div className="flex-1 min-w-0">
            <div className="space-y-8">
              {/* Overview Section — hidden when filter is active */}
              <div className={hasActiveFilter ? 'hidden' : undefined}>
                <OverviewSection
                  sips={filterEipsByLayer(sips)}
                  forkName={forkName}
                  status={status}
                  activationDate={activationDate}
                  onStageClick={scrollToSection}
                  activationDetails={activationDetails}
                />
              </div>

              {/* Timeline Section — hidden when filter is active */}
              {(() => {
                const timelineConfig: Record<string, { description: string; component: React.ReactNode }> = {
                  hegota: {
                    description: 'The planning timeline for Hegotá, showing the progression from headliner selection to final implementation decisions.',
                    component: <HegotaTimeline />
                  },
                  glamsterdam: {
                    description: 'The planning timeline for Glamsterdam, showing the progression from headliner selection to final implementation decisions.',
                    component: <GlamsterdamTimeline />
                  },
                  fusaka: {
                    description: 'The deployment timeline for Fusaka, showing the progression from devnets through testnet deployments to sila-mainnet.',
                    component: <FusakaTimeline />
                  },
                  pectra: {
                    description: 'The deployment timeline for Pectra, showing the progression from devnets through testnet deployments to sila-mainnet.',
                    component: <PectraTimeline />
                  },
                };
                const config = timelineConfig[forkName.toLowerCase()];
                if (!config) return null;
                const sectionId = `${forkName.toLowerCase()}-timeline`;
                return (
                  <div className={`space-y-6${hasActiveFilter ? ' hidden' : ''}`} id={sectionId} data-section>
                    <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100">Timeline</h2>
                        <CopyLinkButton
                          sectionId={sectionId}
                          title="Copy link to timeline"
                          size="sm"
                        />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
                        {config.description}
                      </p>
                    </div>
                    {config.component}
                  </div>
                );
              })()}

              {/* SIPs Grouped by Stage - hidden in headlinerSelection mode */}
              {/* For Live upgrades, only show Included and Declined for Inclusion */}
              {pageMode !== 'headlinerSelection' && (status === 'Live'
                ? [
                    { stage: 'Included', description: 'SIPs that are part of the activated upgrade on sila-mainnet.' },
                    { stage: 'Declined for Inclusion', description: 'SIPs that were proposed, but ultimately declined for inclusion in the upgrade for various reasons. They may be reconsidered for future upgrades.' }
                  ]
                : [
                    { stage: 'Included', description: 'SIPs that are part of the activated upgrade on sila-mainnet.' },
                    { stage: 'Scheduled for Inclusion', description: 'SIPs that client teams have agreed to implement in the next upgrade devnet. These are very likely to be included in the final upgrade.' },
                    { stage: 'Considered for Inclusion', description: 'SIPs that client teams are positive towards. Implementation may begin, but inclusion is not yet guaranteed.' },
                    { stage: 'Proposed for Inclusion', description: 'SIPs that have been proposed for this upgrade but are still under initial review by client teams.' },
                    { stage: 'Declined for Inclusion', description: 'SIPs that were proposed, but ultimately declined for inclusion in the upgrade for various reasons. They may be reconsidered for future upgrades.' }
                  ]
              ).map(({ stage, description }) => {
                let stageEips = sips.filter(sip => getInclusionStage(sip, forkName) === stage);

                // For Glamsterdam, exclude unselected headliner candidates since they have their own section
                // Selected headliners should still appear in their respective stages
                if (forkName.toLowerCase() === 'glamsterdam') {
                  stageEips = stageEips.filter(sip => !isUnselectedHeadlinerCandidate(sip, forkName));
                }


                // Apply layer and search filters
                stageEips = filterEips(stageEips);

                if (stageEips.length === 0) return null;

                // Sort SIPs: headliners first, then by SIP number
                const sortedStageEips = stageEips.sort((a, b) => {
                  const aIsHeadliner = isHeadliner(a, forkName);
                  const bIsHeadliner = isHeadliner(b, forkName);

                  // If one is headliner and other isn't, headliner comes first
                  if (aIsHeadliner && !bIsHeadliner) return -1;
                  if (!aIsHeadliner && bIsHeadliner) return 1;

                  // If both are same type (both headliner or both not), sort by SIP number
                  return a.id - b.id;
                });
                const stageId = stage.toLowerCase().replace(/\s+/g, '-');
                const isDeclinedStage = stage === 'Declined for Inclusion';

                return (
                  <div key={stage} className="space-y-6" id={stageId} data-section>
                    <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100">{stage}</h2>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getInclusionStageColor(stage as InclusionStage)}`}>
                          {stageEips.length} SIP{stageEips.length !== 1 ? 's' : ''}
                        </span>
                        {isDeclinedStage && (
                          <button
                            onClick={() => setIsDeclinedExpanded(!isDeclinedExpanded)}
                            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                          >
                            {isDeclinedExpanded ? 'Collapse' : 'Expand'}
                            <svg
                              className={`w-3.5 h-3.5 transition-transform ${isDeclinedExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        )}
                        <CopyLinkButton
                          sectionId={stageId}
                          title={`Copy link to ${stage}`}
                          size="sm"
                        />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">{description}</p>
                    </div>

                    {isDeclinedStage && !isDeclinedExpanded ? (
                      <div className="bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded p-4">
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {stageEips.length} SIP{stageEips.length !== 1 ? 's' : ''} declined for inclusion in this upgrade.
                          <button
                            onClick={() => setIsDeclinedExpanded(true)}
                            className="ml-1 text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100 underline decoration-1 underline-offset-2 transition-colors"
                          >
                            Click to expand and view details.
                          </button>
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {sortedStageEips.map(sip => {
                          const eipId = `sip-${sip.id}`;

                          // For declined SIPs, show simplified view
                          if (isDeclinedStage) {
                            return (
                              <article key={sip.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded p-4" id={eipId} data-section>
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h3 className="text-base font-medium text-slate-900 dark:text-slate-100 leading-tight mb-2">
                                      <span className="text-slate-400 dark:text-slate-400 text-sm font-mono mr-2">{getProposalPrefix(sip)}-{sip.id}</span>
                                      <span>{sip.title}</span>
                                    </h3>
                                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                                      {getSummaryDescription(sip)}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 ml-4">
                                    {sip.discussionLink && (
                                      <Tooltip text="View discussion">
                                        <a
                                          href={sip.discussionLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          onClick={() => handleExternalLinkClick('discussion', sip.discussionLink ?? '')}
                                          className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer relative group"
                                        >
                                          <div className="relative w-7 h-7">
                                            <img
                                              src="/sil-mag.png"
                                              alt="Sila Magicians"
                                              className="w-7 h-7 opacity-90 dark:opacity-70"
                                            />
                                            <svg
                                              className="absolute -bottom-0.5 -right-0.5 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                              fill="none"
                                              stroke="currentColor"
                                              strokeWidth="2"
                                              viewBox="0 0 24 24"
                                            >
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                          </div>
                                        </a>
                                      </Tooltip>
                                    )}
                                    <Tooltip text="View specification">
                                      <a
                                        href={getSpecificationUrl(sip)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => handleExternalLinkClick('specification', getSpecificationUrl(sip))}
                                        className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer relative group"
                                      >
                                        <div className="relative w-7 h-7">
                                          <img
                                            src="/sil-diamond-black.png"
                                            alt="Sila"
                                            className="w-7 h-7 opacity-90 dark:opacity-100 dark:invert"
                                          />
                                          <svg
                                            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            viewBox="0 0 24 24"
                                          >
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                          </svg>
                                        </div>
                                      </a>
                                    </Tooltip>
                                  </div>
                                </div>
                              </article>
                            );
                          }

                          // Full view for non-declined SIPs
                          return <EipCard key={sip.id} sip={sip} forkName={forkName} handleExternalLinkClick={handleExternalLinkClick} />;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Headliner Proposals Section - shown in headlinerSelection mode or for forks with historical candidates */}
              {(() => {
                const headlinerEips = filterEips(sips.filter(sip => wasHeadlinerCandidate(sip, forkName)));
                const filteredPendingProposals = getPendingProposalsForFork(forkName);
                const totalProposals = headlinerEips.length + filteredPendingProposals.length;
                const showSection = (pageMode === 'headlinerSelection' || forkName.toLowerCase() === 'glamsterdam' || forkName.toLowerCase() === 'hegota') && totalProposals > 0;

                if (!showSection) return null;

                return (
                <div className="space-y-6" id="headliner-proposals" data-section>
                  <div className="border-b border-slate-200 dark:border-slate-700 pb-4">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-xl font-medium text-slate-900 dark:text-slate-100">Headliner Proposals</h2>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300">
                        {totalProposals} proposal{totalProposals !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => setIsHeadlinerProposalsExpanded(!isHeadlinerProposalsExpanded)}
                        className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                      >
                        {isHeadlinerProposalsExpanded ? 'Collapse' : 'Expand'}
                        <svg
                          className={`w-3.5 h-3.5 transition-transform ${isHeadlinerProposalsExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <CopyLinkButton
                        sectionId="headliner-proposals"
                        title="Copy link to headliner proposals"
                        size="sm"
                      />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 max-w-3xl">
                      Headliners are the most important features to include in each network upgrade. {pageMode === 'headlinerSelection' ? 'The following headliner proposals are under consideration.' : 'The community considered the following headliner proposals.'}
                    </p>
                  </div>

                  {!isHeadlinerProposalsExpanded ? (
                    <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-600 rounded p-4">
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {totalProposals} headliner proposal{totalProposals !== 1 ? 's' : ''} {pageMode === 'headlinerSelection' ? 'are under consideration for' : 'were considered for inclusion in'} this network upgrade.
                        <button
                          onClick={() => setIsHeadlinerProposalsExpanded(true)}
                          className="ml-1 text-purple-700 hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100 underline decoration-1 underline-offset-2 transition-colors"
                        >
                          Click to expand and view details.
                        </button>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Client Team Perspectives */}
                      <ClientPerspectives
                        perspectives={clientTeamPerspectives}
                        onLinkClick={(url: string) => {
                          window.open(url, '_blank');
                          handleExternalLinkClick('client_perspective', url);
                        }}
                      />

                      {filterEips(sips)
                        .filter(sip => wasHeadlinerCandidate(sip, forkName))
                        .sort((a, b) => {
                          const layerSort = sortByLayer({ layer: getEipLayer(a) }, { layer: getEipLayer(b) });
                          if (layerSort !== 0) return layerSort;
                          return a.id - b.id;
                        })
                        .map(sip => {
                          const isDuplicateStageCard = isEipRenderedInStageSections(sip);
                          return (
                            <EipCard
                              key={sip.id}
                              sip={sip}
                              forkName={forkName}
                              handleExternalLinkClick={handleExternalLinkClick}
                              cardId={isDuplicateStageCard ? `headliner-proposal-sip-${sip.id}` : undefined}
                              showCopyLink={!isDuplicateStageCard}
                            />
                          );
                        })
                      }

                      {/* Pending Proposals - forum discussions without SIP numbers yet */}
                      {getPendingProposalsForFork(forkName)
                        .filter(proposal => layerFilter === 'all' || proposal.layer === layerFilter)
                        .sort((a, b) => {
                          const layerSort = sortByLayer(a, b);
                          if (layerSort !== 0) return layerSort;
                          return a.title.localeCompare(b.title);
                        })
                        .map(proposal => (
                          <article
                            key={proposal.id}
                            id={`pending-${proposal.id}`}
                            data-section
                            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded p-8"
                          >
                            <header className="border-b border-slate-100 dark:border-slate-700 pb-6 mb-6">
                              <div className="flex items-center gap-3">
                                <h3 className="text-base font-medium text-slate-900 dark:text-slate-100 leading-tight flex-1">
                                  <span className="text-slate-400 dark:text-slate-400 text-sm font-mono mr-2">Pending</span>
                                  <span>{proposal.title}</span>
                                  <Tooltip text={proposal.layer === 'EL' ? 'Primarily impacts Execution Layer' : 'Primarily impacts Consensus Layer'}>
                                    <span className={`px-2 py-1 text-xs font-medium rounded ml-2 relative -top-px ${
                                      proposal.layer === 'EL'
                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-600'
                                        : 'bg-teal-100 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300 border border-teal-200 dark:border-teal-600'
                                    }`}>
                                      {proposal.layer}
                                    </span>
                                  </Tooltip>
                                </h3>
                                <Tooltip text="View forum discussion">
                                  <a
                                    href={proposal.forumLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => handleExternalLinkClick('pending_proposal', proposal.forumLink)}
                                    className="text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 transition-colors cursor-pointer relative group"
                                  >
                                    <div className="relative w-7 h-7">
                                      <img
                                        src="/sil-mag.png"
                                        alt="Sila Magicians"
                                        className="w-7 h-7 opacity-90 dark:opacity-70"
                                      />
                                      <svg
                                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                      </svg>
                                    </div>
                                  </a>
                                </Tooltip>
                              </div>
                            </header>
                            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">
                              {proposal.description}
                            </p>
                          </article>
                        ))
                      }
                    </div>
                  )}
                </div>
                );
              })()}
            </div>

            {sips.length === 0 && forkName.toLowerCase() !== 'hegota' && (
              <div className="text-center py-16">
                <p className="text-slate-500 dark:text-slate-400 text-sm">No improvements found for this network upgrade.</p>
              </div>
            )}
          </div>
        </div>
      </div>
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-6">
      {content}
    </div>
  );
};

export default PublicNetworkUpgradePage;
