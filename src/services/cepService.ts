export interface CepAddressResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  formattedAddress: string;
}

export function formatCep(value: string): string {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function buildFormattedAddressFromCep(item: {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  existingNumberOrComplement?: string;
}): string {
  const parts: string[] = [];
  if (item.logradouro?.trim()) {
    if (item.existingNumberOrComplement?.trim()) {
      parts.push(`${item.logradouro.trim()}, ${item.existingNumberOrComplement.trim()}`);
    } else {
      parts.push(item.logradouro.trim());
    }
  } else if (item.existingNumberOrComplement?.trim()) {
    parts.push(item.existingNumberOrComplement.trim());
  }
  if (item.bairro?.trim()) {
    parts.push(item.bairro.trim());
  }
  if (item.localidade?.trim()) {
    parts.push(item.uf?.trim() ? `${item.localidade.trim()} - ${item.uf.trim()}` : item.localidade.trim());
  }
  return parts.join(', ');
}

export async function lookupByCep(rawCep: string): Promise<CepAddressResult | null> {
  const digits = (rawCep || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (res.ok) {
      const data = await res.json();
      if (!data.erro) {
        const cep = formatCep(data.cep || digits);
        const logradouro = data.logradouro || '';
        const complemento = data.complemento || '';
        const bairro = data.bairro || '';
        const localidade = data.localidade || '';
        const uf = data.uf || '';
        return {
          cep,
          logradouro,
          complemento,
          bairro,
          localidade,
          uf,
          formattedAddress: buildFormattedAddressFromCep({
            logradouro,
            bairro,
            localidade,
            uf
          })
        };
      }
    }
  } catch {
    // Fallback to BrasilAPI below
  }

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
    if (res.ok) {
      const data = await res.json();
      const cep = formatCep(data.cep || digits);
      const logradouro = data.street || '';
      const bairro = data.neighborhood || '';
      const localidade = data.city || '';
      const uf = data.state || '';
      return {
        cep,
        logradouro,
        complemento: '',
        bairro,
        localidade,
        uf,
        formattedAddress: buildFormattedAddressFromCep({
          logradouro,
          bairro,
          localidade,
          uf
        })
      };
    }
  } catch {
    // Ignore network error
  }

  return null;
}

export async function searchCepByAddress(
  uf: string,
  city: string,
  streetQuery: string
): Promise<CepAddressResult[]> {
  const cleanUf = (uf || 'BA').trim().toUpperCase();
  const cleanCity = (city || 'Salvador').trim();
  const cleanStreet = (streetQuery || '')
    .trim()
    .replace(/^(rua|av\.?|avenida|alameda|al\.?|travessa|tv\.?|praça|pç\.?|largo|estrada|rodovia)\s+/i, '')
    .trim();

  const queryTerm = cleanStreet.length >= 3 ? cleanStreet : streetQuery.trim();
  if (cleanUf.length !== 2 || cleanCity.length < 3 || queryTerm.length < 3) {
    return [];
  }

  try {
    const url = `https://viacep.com.br/ws/${encodeURIComponent(cleanUf)}/${encodeURIComponent(
      cleanCity
    )}/${encodeURIComponent(queryTerm)}/json/`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data.slice(0, 15).map((item: any) => {
      const cep = formatCep(item.cep || '');
      const logradouro = item.logradouro || '';
      const complemento = item.complemento || '';
      const bairro = item.bairro || '';
      const localidade = item.localidade || cleanCity;
      const itemUf = item.uf || cleanUf;
      return {
        cep,
        logradouro,
        complemento,
        bairro,
        localidade,
        uf: itemUf,
        formattedAddress: buildFormattedAddressFromCep({
          logradouro,
          bairro,
          localidade,
          uf: itemUf
        })
      };
    });
  } catch {
    return [];
  }
}

export function extractStreetAndNumber(rawAddress: string): {
  street: string;
  numberPart: string;
} {
  if (!rawAddress || !rawAddress.trim()) {
    return { street: '', numberPart: '' };
  }
  const parts = rawAddress.split(',').map(p => p.trim()).filter(Boolean);
  const firstPart = parts[0] || '';
  const secondPart = parts[1] || '';
  const numberMatch = secondPart.match(/^\d+[a-zA-Z0-9\s/-]*/);
  return {
    street: firstPart,
    numberPart: numberMatch ? numberMatch[0].trim() : ''
  };
}
