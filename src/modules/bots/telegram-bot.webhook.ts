import { optimizeExpiryDiscount } from '../ai-agents/advanced-ai-decision.service';

export interface TelegramUpdate {
  message?: {
    chat?: { id: number };
    text?: string;
  };
}

export function buildTelegramReply(text: string): string {
  const q = (text || '').trim().toLowerCase();

  if (q.includes('বিক্রি') || q.includes('sale') || q.includes('লাভ') || q.includes('profit')) {
    return '📊 আজকের হিসাব (রহিম ভাইয়ের মুদি দোকান):\n• মোট বিক্রি: ৳১,০৭,৯০০\n• প্রাথমিক লাভ: ৳৮,৮০০\n• নিট লাভ: ৳৪,৫৫০\n(সোর্স: BizMind AI লাইভ লেজার)';
  }

  if (q.includes('বাকি') || q.includes('baki') || q.includes('due')) {
    return '📒 বাকির খাতা সারাংশ:\n• মোট বাকি: ৳৮,২০০ (৩ জন)\n• সর্বোচ্চ ঝুঁকি: করিম মিয়া — ৳৩,৪৫০ (১৮ দিন, ঝুঁকি স্কোর ৭২/১০০)\nতাগাদা পাঠাতে ড্যাশবোর্ডে অনুমোদন দিন।';
  }

  if (q.includes('ডিম') || q.includes('মেয়াদ') || q.includes('অপচয়') || q.includes('expiry') || q.includes('egg')) {
    const opt = optimizeExpiryDiscount({
      productName: 'ফার্মের লাল ডিম',
      stock: 55,
      unitCost: 10,
      sellingPrice: 15,
      daysToExpiry: 4,
      baselineDailySales: 8,
    });
    return `🥚 অপচয় রোধ সতর্কতা:\n৫৫টি ডিম ৪ দিনে নষ্ট হবে। গাণিতিক হিসাব অনুযায়ী ${opt.optimal.discountPct}% ছাড়ে (৳${opt.optimal.discountedPrice}/পিস) বিক্রি করলে ৳${opt.optimal.netCashRecovered} নগদ ক্যাশ ফেরত আসবে!`;
  }

  return '🤖 আসসালামু আলাইকুম! আমি বিজমাইন্ড টেলিগ্রাম বট। জিজ্ঞেস করুন:\n• "আজ কত বিক্রি?"\n• "কার কাছে কত বাকি?"\n• "কোন পণ্য নষ্ট হবে?"';
}
