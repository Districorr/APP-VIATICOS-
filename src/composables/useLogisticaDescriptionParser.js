// src/composables/useLogisticaDescriptionParser.js
import { computed } from 'vue';

/**
 * Composable no invasivo para analizar descripciones de logística
 * y generar sugerencias en tiempo real (badges/chips cliqueables).
 * NO sobrescribe ningún campo automáticamente.
 *
 * @param {Ref<string>} descriptionRef - Referencia reactiva a la descripción del usuario.
 * @param {Ref<Array>} clientesOptions - Lista de clientes cargados desde el maestro.
 * @param {Ref<Array>} proveedoresOptions - Lista de proveedores cargados desde el maestro.
 * @returns {Object} sugerencias computadas y helper de aplicación.
 */
export function useLogisticaDescriptionParser(descriptionRef, clientesOptions = null, proveedoresOptions = null) {
  const sugerencias = computed(() => {
    const text = (descriptionRef.value || '').trim();
    if (!text) {
      return {
        tipo_logistica: null,
        tipo_movimiento_encomienda: null,
        paciente_referido: null,
        cliente_sugerido: null,
        proveedor_sugerido: null,
        hasSuggestions: false,
      };
    }

    const textUpper = text.toUpperCase();
    let tipoLogistica = null;
    let tipoMovimiento = null;
    let paciente = null;
    let cliente = null;
    let proveedor = null;

    // 1. Detección de Tipo de Logística y Tipo de Movimiento por palabras clave
    if (textUpper.includes('CIRUGIA') || textUpper.includes('CIRUGÍA')) {
      tipoLogistica = 'cirugia';
    }

    if (textUpper.includes('DEVOLUCION') || textUpper.includes('DEVOLUCIÓN')) {
      tipoMovimiento = 'Devolución';
    } else if (textUpper.includes('REPOSICION') || textUpper.includes('REPOSICIÓN') || textUpper.includes('STOCK')) {
      tipoMovimiento = 'Reposición';
    } else if (textUpper.includes('RETIRO')) {
      tipoMovimiento = 'Retiro';
    } else if (textUpper.includes('RECEPCION') || textUpper.includes('RECEPCIÓN')) {
      tipoMovimiento = 'Recepción';
    } else if (textUpper.includes('ENVIO') || textUpper.includes('ENVÍO')) {
      tipoMovimiento = 'Envío';
    }

    // 2. Detección de Paciente Referido ("PTE", "PTE.", "PACIENTE")
    const matchPaciente = text.match(/(?:PTE\.?|PACIENTE)\s+([A-ZÁÉÍÓÚÑa-záéíóúñ\s]{3,30})/i);
    if (matchPaciente && matchPaciente[1]) {
      // Limpiar palabras reservadas del final si el matcher tomó de más
      let rawPaciente = matchPaciente[1].split(/(?:IOSCOR|INSSSEP|SWISS|SANCOR|OSDE|PAMI|CIRUGIA|DEVOLUCION)/i)[0];
      paciente = rawPaciente.trim();
    }

    // 3. Coincidencia sugerida con Clientes desde el Maestro
    if (clientesOptions && Array.isArray(clientesOptions.value)) {
      const matchCliente = clientesOptions.value.find(c => {
        const name = (c.label || c.nombre_cliente || '').toUpperCase();
        return name.length > 2 && textUpper.includes(name);
      });
      if (matchCliente) {
        cliente = { id: matchCliente.code || matchCliente.id, label: matchCliente.label || matchCliente.nombre_cliente };
      }
    }

    // 4. Coincidencia sugerida con Proveedores desde el Maestro
    if (proveedoresOptions && Array.isArray(proveedoresOptions.value)) {
      const matchProveedor = proveedoresOptions.value.find(p => {
        const name = (p.label || p.nombre || '').toUpperCase();
        return name.length > 2 && textUpper.includes(name);
      });
      if (matchProveedor) {
        proveedor = { id: matchProveedor.code || matchProveedor.id, label: matchProveedor.label || matchProveedor.nombre };
      }
    }

    // 5. Detección de N° de Guía / Factura / Remito ("FAC", "FACTURA", "GUIA", "REMITO", "RECIBO", "N°", "Nº")
    let numeroGuiaSugerido = null;
    const matchGuia = text.match(/(?:FAC(?:TURA)?|GU[IÍ]A|REMITO|RECIBO|N[°º])[:\s]*([A-Z0-9\-\.\/]{3,25})/i);
    if (matchGuia && matchGuia[1]) {
      numeroGuiaSugerido = matchGuia[1].trim();
    }

    const hasSuggestions = !!(tipoLogistica || tipoMovimiento || paciente || cliente || proveedor || numeroGuiaSugerido);

    return {
      tipo_logistica: tipoLogistica,
      tipo_movimiento_encomienda: tipoMovimiento,
      paciente_referido: paciente,
      cliente_sugerido: cliente,
      proveedor_sugerido: proveedor,
      numero_guia_sugerido: numeroGuiaSugerido,
      hasSuggestions,
    };
  });

  return {
    sugerencias,
  };
}
