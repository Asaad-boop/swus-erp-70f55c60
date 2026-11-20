-- Quick reply categories + a richer starter set of Bangla presets.
ALTER TABLE public.inbox_quick_replies ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

UPDATE public.inbox_quick_replies SET category = CASE shortcut
  WHEN '/hi' THEN 'greeting'
  WHEN '/thanks' THEN 'greeting'
  WHEN '/order' THEN 'order'
  WHEN '/confirm' THEN 'order'
  WHEN '/delivery' THEN 'delivery'
  WHEN '/time' THEN 'delivery'
  ELSE category END
WHERE category = 'general';

INSERT INTO public.inbox_quick_replies (brand_id, shortcut, title, body, category, sort_order)
SELECT NULL, v.shortcut, v.title, v.body, v.category, v.sort_order FROM (VALUES
  ('/price', 'Dam jante chobi chai', 'কোন প্রোডাক্টটি নিতে চাচ্ছেন, প্রোডাক্টের ছবি বা স্ক্রিনশট দিন প্লিজ, আমি দামটা জানিয়ে দিচ্ছি 😊', 'price', 10),
  ('/cod', 'Cash on delivery', 'জ্বি, ক্যাশ অন ডেলিভারি ✅ প্রোডাক্ট হাতে পেয়ে চেক করে টাকা দিবেন, অগ্রিম কোনো টাকা লাগবে না।', 'payment', 20),
  ('/advance', 'Delivery charge advance', 'অর্ডার কনফার্ম করতে শুধু ডেলিভারি চার্জটা অগ্রিম bKash/Nagad করতে হবে, বাকি টাকা প্রোডাক্ট হাতে পেয়ে দিবেন 🙏', 'payment', 21),
  ('/stock', 'Stock ache', 'জ্বি, প্রোডাক্টটি স্টকে আছে ✅ এখনই অর্ডার করলে দ্রুত পেয়ে যাবেন ইনশাআল্লাহ।', 'price', 11),
  ('/out', 'Stock shesh', 'দুঃখিত {name}, এই প্রোডাক্টটি এই মুহূর্তে স্টকে নেই 😔 নতুন স্টক আসলে আপনাকে জানিয়ে দিব ইনশাআল্লাহ।', 'price', 12),
  ('/offer', 'Offer', '🎁 আজকের বিশেষ অফার চলছে! স্টক শেষ হওয়ার আগেই অর্ডার করে নিন।', 'offer', 30),
  ('/followup', 'Follow-up', 'আসসালামু আলাইকুম {name} 😊 প্রোডাক্টটি নিয়ে আর কিছু জানার আছে? অর্ডার করতে চাইলে নাম, নাম্বার আর ঠিকানা দিয়ে দিন।', 'followup', 40),
  ('/address', 'Full address chai', 'আপনার পূর্ণ ঠিকানাটা দিন প্লিজ — বাসা/রোড, এলাকা, থানা আর জেলা সহ, যাতে ডেলিভারি ম্যান সহজে পৌঁছাতে পারে 🙏', 'order', 6),
  ('/call', 'Call receive', 'ডেলিভারির দিন কুরিয়ার থেকে কল দিবে, ফোনটা রিসিভ করবেন প্লিজ 📞', 'delivery', 7),
  ('/sorry', 'Deri hoyeche', 'দেরিতে রিপ্লাই দেওয়ার জন্য দুঃখিত {name} 🙏 এখন বলুন, কিভাবে সাহায্য করতে পারি?', 'greeting', 3)
) AS v(shortcut, title, body, category, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.inbox_quick_replies q WHERE q.shortcut = v.shortcut AND q.brand_id IS NULL);
