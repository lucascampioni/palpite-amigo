-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'application/pdf']
);

-- Add payment_proof column to participants table
ALTER TABLE participants
ADD COLUMN IF NOT EXISTS payment_proof TEXT;

-- Storage policies for payment proofs
CREATE POLICY "Users can upload their own payment proof"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own payment proof"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Pool owners can view participant payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM participants p
    JOIN pools po ON po.id = p.pool_id
    WHERE po.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = p.user_id::text
  )
);

CREATE POLICY "Users can update their own payment proof"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own payment proof"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  auth.uid()::text = (storage.foldername(name))[1]
);