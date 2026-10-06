-- =============================================================================
-- 2026-10-05 — Referencias a archivos que ya no están en el volumen uploads
-- -----------------------------------------------------------------------------
-- Qué hace:     MUEVE DATOS. Borrado lógico de las filas cuyo archivo no existe en
--               /app/uploads del contenedor medos-backend (/files/... respondía 404):
--               48 appointment_files y sus 16 mammography_analyses (pacientes de QA
--               Martha Gonzales y Esteban Marquez, médicos de QA julio/daniel,
--               2026-03 a 2026-06), 16 common_person_images, 5 doctor_images,
--               8 medical_center_images, y medical_centers.image_url de la clínica que
--               apuntaba a una de ellas. Ninguna la creó scripts/seed-demo.js: son
--               subidas de QA anteriores al volumen actual. Los originales (dataset
--               Roboflow, capturas) no están ni en el volumen ni en el disco del host,
--               así que no se pueden restaurar; sin foto, la interfaz muestra iniciales.
-- Precondición: lista de ids sacada el 2026-10-05 con un recorrido de todas las
--               columnas de ruta contra `test -f` dentro del contenedor (ver docs/tasks/
--               2026-10-06-001 §Archivos). Volver a correr ese recorrido antes de
--               aplicar en otra base: los ids son de esta base local.
-- Idempotente:  sí (solo toca filas con deleted_at IS NULL; 2.ª corrida = 0 filas).
-- Transacción:  sí (BEGIN/COMMIT abajo).
-- Orden:        después de las migraciones TypeORM hasta 1790521400000; independiente
--               de los demás scripts de esta carpeta.
-- =============================================================================

CREATE TEMP TABLE missing_appointment_files (id uuid PRIMARY KEY);
INSERT INTO missing_appointment_files VALUES
    ('705ed612-5b53-4a44-a03c-4c065b13ba7f'),
    ('f21c5154-9674-45e3-b5a6-9ed19d43f614'),
    ('e7e374b3-a136-49b1-88c2-597db3b90adb'),
    ('100a622f-2472-43ab-a643-aa98f9c37fe2'),
    ('ec51b762-54d9-4848-b6dd-a023d80e7b21'),
    ('28b51211-6be5-445d-b148-b7b2e9acaa06'),
    ('087d9384-c545-4c8d-99cd-9ca97825d325'),
    ('5df7001f-37fd-4551-9233-ae4424b36536'),
    ('4409e400-a14f-4834-8f6c-adc80a3db8a7'),
    ('6f8aefee-4799-448d-896c-2f2225b04309'),
    ('05063e81-65d6-41e3-8378-19578740e84c'),
    ('f933c44e-b650-4dd4-91f4-dcde0fb5413e'),
    ('33b7599c-5f59-4099-9107-638c193e9cbc'),
    ('dc2b0fed-ea0a-4f22-90e4-5f4927a2882b'),
    ('5f8853b0-d608-450b-a3d1-73f12f37faef'),
    ('28ecd28d-a46a-4da5-8481-d2cca14a7cdc'),
    ('bd2222b7-1f1b-435a-b0c5-d9847901d64a'),
    ('b7087ada-b64c-4936-bc4f-80f3292e45c9'),
    ('1a7e2458-7fec-4353-bad1-4d5019868aaa'),
    ('fb0f6cf4-045d-4f82-ae50-74640f51391d'),
    ('96c4b0cc-8531-45f8-964f-a541f7106bdc'),
    ('db36d56d-50a6-4e35-8c28-1a2b926fcc00'),
    ('6da4a4a8-e1b3-497e-ba60-1223ff30f703'),
    ('15012da0-6770-41c2-8e12-d292dff1bd19'),
    ('87ce117f-f5cf-4012-b735-150918eea053'),
    ('811b424e-a39c-45ca-b537-42b4fbb9c245'),
    ('e8b5eebb-fae3-47be-9c1c-3b4e13cd7035'),
    ('d5ce1b46-cb26-4443-b024-50bb125776ea'),
    ('ac26d54a-657b-434e-9956-945a640af3e4'),
    ('f2f3915f-a408-4a04-a603-6a1ed558ef7b'),
    ('39e83173-5fb1-4f25-8371-a925f86d19ac'),
    ('85c03e7e-e5ba-453d-bda2-0121d53cf717'),
    ('03e3418b-df28-4678-8e7b-4434e74263ff'),
    ('3101fc4c-13d4-4994-83a5-a49d9187294c'),
    ('92723fc8-cedd-4b11-abcb-8a5443230493'),
    ('792b73ed-c5e8-43fb-8468-8e959da339fc'),
    ('a3bbb51e-dc85-4490-b221-a39fda031966'),
    ('b7184aff-fb07-4eb2-b2b1-71baf8c472b7'),
    ('77c2bd71-cd00-46b5-b42e-15b05a623d64'),
    ('5eb5c6fb-5f12-4018-a748-2c5c4826ee28'),
    ('a0e5b61d-e64c-4479-b194-af883282d6e9'),
    ('8c645c92-63ae-421d-8f96-fb0a0a958c3a'),
    ('a12e17c6-62fd-4e2b-987d-ca872389ce89'),
    ('3e914712-fc06-403f-be58-2e6bedac4c3b'),
    ('58f3d575-34a1-466b-860d-579429366e60'),
    ('b883c4b2-4851-44f6-a2a4-d85494d64c20'),
    ('249fb438-849a-41d2-a9ad-cba95b0a7aca'),
    ('307177b0-c8fe-4362-a70d-498bc8c44719')
;

CREATE TEMP TABLE missing_mammography_analyses (id uuid PRIMARY KEY);
INSERT INTO missing_mammography_analyses VALUES
    ('e4923e34-003c-4250-81f6-543fad6bf6a8'),
    ('9a29ce7a-2499-459d-9369-eb5b38014aff'),
    ('c2b2c528-2fff-4c0a-8f0a-4640ae4f8667'),
    ('23c9343a-549a-4a5d-a9f7-f451326259c0'),
    ('e56206ff-d218-4871-90b7-c2f459f348a0'),
    ('7119bb57-7eeb-40be-a0c6-a9589a6f807e'),
    ('833b1398-5b25-4f68-9f39-77a11227563d'),
    ('741005c2-2e23-4284-838e-da4d24be8758'),
    ('fa80d5d2-2207-4632-bc73-79eaa05406f7'),
    ('01524e8a-df66-4cc0-bd50-df419fab9e8a'),
    ('a2d9a6ed-3f31-4b18-9c88-fdb03c5f8f9b'),
    ('b37a49f2-eb16-485d-8cd3-5d6b8e466383'),
    ('538c15d1-2c2a-4cc6-8b02-36fc776e536e'),
    ('956383d0-ef75-4e87-8c7a-94b511b7a540'),
    ('72fb5ac8-5c9a-4d41-9e77-d16be7ff9e3c'),
    ('ecdab364-10d5-4cf5-8020-4623f5785e69')
;

CREATE TEMP TABLE missing_common_person_images (id uuid PRIMARY KEY);
INSERT INTO missing_common_person_images VALUES
    ('7894f244-c890-4815-8408-fd15fe76167f'),
    ('b5dc7bcc-d7ec-4b8b-806e-6c57f9517f25'),
    ('b942e752-eeb7-4d01-8451-7bc73a24d8ff'),
    ('77201441-b6d4-4d90-a1f4-6a99d1a925a8'),
    ('2b1a1bb2-f242-487f-8540-4e97cf335f56'),
    ('64d215dc-5d70-40c4-a26d-cfb23c109f86'),
    ('d9588a54-39bd-4281-a83d-8216f5b82b54'),
    ('c052e68c-de67-4ebc-a701-e0e99348b5c2'),
    ('18910bc1-fc86-462f-91d3-baba315c78cc'),
    ('dc1160f7-e9c5-448d-9f3c-b465c797359e'),
    ('d6d4e140-9abe-4064-bdc2-12b61f7c5066'),
    ('77c72983-1657-4335-8fbd-f53045845b2c'),
    ('97ed5841-8161-4a16-a438-967e00778fe9'),
    ('2d1ab6ba-79b4-4c04-86e7-7cd564ceb92c'),
    ('ed4a6ff5-2ac3-48c6-88c1-bd3f1166c710'),
    ('8303e773-9627-4b02-917a-a781801e925a')
;

CREATE TEMP TABLE missing_doctor_images (id uuid PRIMARY KEY);
INSERT INTO missing_doctor_images VALUES
    ('4986595a-335f-4840-acf9-d0ca7f377bdb'),
    ('8d7d2888-17e7-4712-af10-c67554f28320'),
    ('3d73cf0d-018e-4f83-8d99-21c824b5c367'),
    ('0b9c67b7-e44f-406f-a293-d68ac3464123'),
    ('e0ac7ea9-1e99-4917-ad1e-dfc69df00889')
;

CREATE TEMP TABLE missing_medical_center_images (id uuid PRIMARY KEY);
INSERT INTO missing_medical_center_images VALUES
    ('c732d208-8c41-4fff-9d6d-e32c9ce94ee5'),
    ('21433caa-084b-4db5-9cd3-8fc75212e0ef'),
    ('25aaa4da-d246-48a6-827f-8055fc7763f2'),
    ('2f928206-39a5-4331-9d15-f6d5ba2ab171'),
    ('a987b77d-180f-49aa-aeb6-973460011f93'),
    ('7e8d6003-9cac-441f-b632-ca17a691c930'),
    ('d879044c-f4ad-436d-8079-4c1a78c9835c'),
    ('28439edd-bd01-41d8-8bb4-e6cba3b6b5e3')
;

-- Verificación previa (esperado al 2026-10-05: 48, 16, 16, 5, 8, 1).
SELECT 'appointment_files' AS tabla, count(*) FROM public.appointment_files WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_appointment_files)
UNION ALL SELECT 'mammography_analyses', count(*) FROM public.mammography_analyses WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_mammography_analyses)
UNION ALL SELECT 'common_person_images', count(*) FROM public.common_person_images WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_common_person_images)
UNION ALL SELECT 'doctor_images', count(*) FROM public.doctor_images WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_doctor_images)
UNION ALL SELECT 'medical_center_images', count(*) FROM parametro.medical_center_images WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_medical_center_images)
UNION ALL SELECT 'medical_centers.image_url', count(*) FROM parametro.medical_centers
  WHERE image_url ~ '/medical-center-images/' AND regexp_replace(image_url, '^.*/medical-center-images/', '')::uuid IN (SELECT id FROM missing_medical_center_images);

-- Análisis colgados de un archivo perdido que no estén en la lista (esperado: 0).
SELECT count(*) AS analisis_fuera_de_lista FROM public.mammography_analyses
 WHERE deleted_at IS NULL AND appointment_file_id IN (SELECT id FROM missing_appointment_files)
   AND id NOT IN (SELECT id FROM missing_mammography_analyses);

BEGIN;

UPDATE public.mammography_analyses
   SET deleted_at = now(), deleted_by = '00000000-0000-0000-0000-000000000000', updated_at = now()
 WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_mammography_analyses);

UPDATE public.appointment_files SET deleted_at = now(), is_active = false, updated_at = now()
 WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_appointment_files);

UPDATE public.common_person_images SET deleted_at = now(), is_active = false, updated_at = now()
 WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_common_person_images);

UPDATE public.doctor_images SET deleted_at = now(), is_active = false, updated_at = now()
 WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_doctor_images);

UPDATE parametro.medical_centers SET image_url = NULL, updated_at = now()
 WHERE image_url ~ '/medical-center-images/'
   AND regexp_replace(image_url, '^.*/medical-center-images/', '')::uuid IN (SELECT id FROM missing_medical_center_images);

UPDATE parametro.medical_center_images SET deleted_at = now(), is_active = false, updated_at = now()
 WHERE deleted_at IS NULL AND id IN (SELECT id FROM missing_medical_center_images);

COMMIT;

-- Verificación posterior: la consulta "previa" de arriba debe dar 0 en las seis filas.
-- Después, borrar la caché de Redis (salvo session:* y bull:*) y repetir el recorrido
-- de rutas contra el volumen: 0 referencias rotas.
