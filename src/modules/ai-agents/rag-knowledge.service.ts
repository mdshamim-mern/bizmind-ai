// ============================================================================
// BizMind AI - RAG Knowledge Base & Cosine Similarity Retrieval Engine
// (Compatible with PostgreSQL pgvector; handles policies, shelf-life & docs)
// Note: Financial figures ALWAYS come from deterministic DB Tools, never RAG.
// ============================================================================

export interface KnowledgeDocument {
  id: string;
  category: 'SHELF_LIFE' | 'SHOP_POLICY' | 'SUPPLIER_TERMS' | 'MONTHLY_REPORT';
  title: string;
  content: string;
  tags: string[];
}

export const SHOP_KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    id: 'doc_shelf_eggs',
    category: 'SHELF_LIFE',
    title: 'Food Preservation Guide: Brown Farm Eggs',
    content:
      'Brown farm eggs stay fresh for 14-21 days at room temperature in Bangladesh (shorter in summer: 10-14 days). Batches within 4 days of expiry must be discounted by 15% immediately to recover cash and avoid total spoilage loss.',
    tags: ['egg', 'eggs', 'ডিম', 'expiry', 'shelf', 'waste', 'নষ্ট', 'মেয়াদ'],
  },
  {
    id: 'doc_shelf_milk',
    category: 'SHELF_LIFE',
    title: 'Food Preservation Guide: Pasteurized Liquid Milk',
    content:
      'Pasteurized liquid milk (1L) requires continuous 4°C refrigeration and has a strict 3-5 day shelf life. Pair expiring milk with eggs or bread in a Breakfast Combo Offer 2 days before expiry.',
    tags: ['milk', 'দুধ', 'dairy', 'expiry', 'fridge', 'combo'],
  },
  {
    id: 'doc_policy_discount',
    category: 'SHOP_POLICY',
    title: 'Shop Pricing & Discount Guardrail Policy',
    content:
      'Standard promotional discounts are capped at 10% for slow-moving items and 15-20% for batches expiring within 7 days. Never sell below unit purchase cost without explicit shopkeeper loss approval. BOGO offers must account for 2x unit purchase cost.',
    tags: ['discount', 'price', 'policy', 'ছাড়', 'bogo', 'margin', 'লাভ'],
  },
  {
    id: 'doc_supplier_terms',
    category: 'SUPPLIER_TERMS',
    title: 'Local Supplier Lead Times & Bulk Terms',
    content:
      'Fresh Agro Suppliers delivers eggs, rice, and dairy within 3 days (min order 10 units, 2% bulk rebate above ৳20,000). Meghna Consumer Goods delivers soybean oil and honey within 3-5 days. Always reorder when stock hits ROP = (D * L) + SS.',
    tags: ['supplier', 'delivery', 'lead', 'reorder', 'সাপ্লায়ার', 'অর্ডার', 'oil', 'rice'],
  },
  {
    id: 'doc_policy_baki',
    category: 'SHOP_POLICY',
    title: 'Baki Khata (Customer Credit) Recovery Guidelines',
    content:
      'Customers with credit balances overdue more than 12 days or exceeding ৳3,000 are classified as High Priority. Always send polite, relationship-preserving Bangla reminders offering bKash, Nagad, or in-store cash settlement.',
    tags: ['baki', 'credit', 'due', 'বাকি', 'পাওনা', 'reminder', 'করিম', 'সালমা'],
  },
  {
    id: 'doc_festival_bd',
    category: 'MONTHLY_REPORT',
    title: 'Bangladesh Festival Demand Playbook (Ramadan, Eid, Monsoon)',
    content:
      '10 days before Ramadan and Eid, demand for soybean oil, miniket rice, eggs, sugar, and lentils surges by +40%. During Pohela Boishakh, staples rise +25%. During Monsoon, dry staples (rice, lentils, eggs) rise +20% due to supply disruptions.',
    tags: ['ramadan', 'eid', 'festival', 'monsoon', 'রমজান', 'ঈদ', 'বর্ষা', 'forecast'],
  },
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

export function retrieveRelevantKnowledge(query: string, topK: number = 2): KnowledgeDocument[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return SHOP_KNOWLEDGE_BASE.slice(0, topK);

  const scored = SHOP_KNOWLEDGE_BASE.map((doc) => {
    const docTokens = tokenize(`${doc.title} ${doc.content} ${doc.tags.join(' ')}`);
    let overlap = 0;
    for (const tok of docTokens) {
      if (queryTokens.has(tok)) overlap += 1;
    }
    for (const tag of doc.tags) {
      if (query.toLowerCase().includes(tag.toLowerCase())) overlap += 3;
    }
    const score = overlap / Math.sqrt(Math.max(1, docTokens.length));
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.doc);
}
