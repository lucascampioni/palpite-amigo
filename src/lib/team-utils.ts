export const abbreviateTeamName = (name: string, maxLen = 16): string => {
  if (name.length <= maxLen) return name;
  const abbrevMap: Record<string, string> = {
    'Atletico': 'Atl.',
    'Atlético': 'Atl.',
    'Atletico Paranaense': 'Atl. Paranaense',
    'Atlético Paranaense': 'Atl. Paranaense',
    'Athletico Paranaense': 'Ath. Paranaense',
    'Internacional': 'Inter',
    'Atletico Mineiro': 'Atl. Mineiro',
    'Atlético Mineiro': 'Atl. Mineiro',
    'Atletico MG': 'Atl. MG',
    'Atlético MG': 'Atl. MG',
    'Atletico GO': 'Atl. GO',
    'Atlético GO': 'Atl. GO',
    'Atletico Goianiense': 'Atl. Goianiense',
    'Atlético Goianiense': 'Atl. Goianiense',
  };
  if (abbrevMap[name] && abbrevMap[name].length <= maxLen) return abbrevMap[name];
  return name.substring(0, maxLen - 1) + '…';
};
