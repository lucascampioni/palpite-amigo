-- Criar políticas para o bucket payment-proofs
-- Pool owners podem fazer upload de comprovantes
CREATE POLICY "Pool owners can upload payment proofs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs' 
  AND EXISTS (
    SELECT 1 FROM pools
    WHERE owner_id = auth.uid()
  )
);

-- Pool owners podem visualizar comprovantes de seus pools
CREATE POLICY "Pool owners can view payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM pools
    WHERE owner_id = auth.uid()
  )
);

-- Participantes podem visualizar apenas seus próprios comprovantes
CREATE POLICY "Participants can view their own payment proofs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM participants p
    WHERE p.user_id = auth.uid()
    AND name LIKE p.id || '%'
  )
);

-- Pool owners podem atualizar comprovantes
CREATE POLICY "Pool owners can update payment proofs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM pools
    WHERE owner_id = auth.uid()
  )
);

-- Pool owners podem deletar comprovantes
CREATE POLICY "Pool owners can delete payment proofs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND EXISTS (
    SELECT 1 FROM pools
    WHERE owner_id = auth.uid()
  )
);