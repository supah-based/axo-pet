// Only the six reviewed adult rest surfaces may use this anatomical rig.
export const CANONICAL_POSE_HASHES=Object.freeze({
  "emerald_sprout": "c083791ce00443556e6364d0beba03f20823e1ea392036982ae2674c98990e48",
  "sapphire_tide": "346cc10cd4a85de49e73621a9f4a1e0a97b0b37921089685e57d339be2f7e43e",
  "amethyst_dream": "d1a0dc337ba44628066c51c1425886ed036b695dc010ae0a5c97ca0058cc6da2",
  "solar_peach": "4cf0ff76669518b5e853232ca18a5e9f3da6e9193c471e35161639fdb4e9e062",
  "rose_bloom": "6dfcef5ea13885f75254126adfa2845acf9bc8e1800f31092493aa10b86a020a",
  "midnight_mint": "6e2e4b6fae39dbf2497bd49f5e32d935a4bc3330c9ed9b5dfb0eb93386a6c803"
});
export function canonicalPoseEligible(pet,layers){return pet?.identitySource==='AUTHENTICATED_PET_READ_V1'&&pet.level===10&&layers.find(l=>l.slot==='pet')?.sha256===CANONICAL_POSE_HASHES[pet.lineageId];}
export function canonicalActorKey(pet,layers){return canonicalPoseEligible(pet,layers)?layers.map(l=>l.slot+':'+l.url+':'+l.sha256).join('|'):null;}
