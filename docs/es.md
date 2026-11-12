# SNOTEL

Trae a Gladys **la nieve medida por las estaciones SNOTEL**: unas 900 estaciones automáticas de
montaña del Natural Resources Conservation Service (NRCS) del USDA en el oeste de Estados Unidos
y en Alaska. Espesor de nieve, equivalente en agua de la nieve, la nieve de las últimas 24 horas
y la temperatura del aire, cada hora, a través de la API pública AWDB del NRCS. Sin cuenta, sin
clave.

> **Valores horarios provisionales, no es una alerta de aludes o crecidas.** Los datos SNOTEL
> son mediciones brutas que el NRCS revisa después; pueden llegar tarde, faltar o ser erróneos,
> y la integración depende de su Gladys, de su acceso a Internet y de un servicio público. Antes
> de salir fuera de pista, lea el boletín de su centro de aludes. Sin afiliación con el USDA ni
> el NRCS.

## Lo que obtiene

- **Un dispositivo por estación** seguida, con lo que la estación mide: el **espesor de nieve**,
  el **equivalente en agua** (el agua que daría la nieve al fundirse), esta agua como
  **porcentaje de la mediana** de la fecha (1991-2020) cuando el NRCS tiene una, la **nieve
  nueva de las últimas 24 horas**, la **temperatura del aire** y la fecha de la última medición.
- Las unidades que usted elija: cm, mm y °C, o pulgadas y °F como las publica el NRCS.
- Una estación que deja de enviar se muestra como tal («Sin nueva medición desde…»): un valor
  antiguo nunca se vuelve a enviar como si fuera reciente.
- Un **widget de panel**: sus estaciones con su espesor de nieve y la nieve nueva, o el detalle
  de una estación.
- Un botón **«Buscar estaciones»** que enumera las estaciones de un estado, por nombre o número,
  o alrededor de su casa, con su triplete, altitud y distancia.
- Las escenas usan directamente las funciones: «nieve nueva por encima de 20 cm» es un día de
  nieve polvo.

## Requisitos

- Gladys Assistant **5.1.0** o posterior.
- Acceso a Internet desde Gladys: la integración lee `wcc.sc.egov.usda.gov`.
- Para «Alrededor de mi casa»: la ubicación de su casa en Gladys (Ajustes, Casas). La
  integración la pide en la instalación (permiso «location»). Solo sirve dentro del contenedor
  para encontrar las estaciones más cercanas: nunca se envía al NRCS, nunca se guarda ni se
  registra.
- SNOTEL cubre las montañas del oeste de Estados Unidos y Alaska. Una estación de otra red del
  NRCS (SCAN, SNOLITE…) puede seguirse por su triplete: obtiene lo que mide.

## Configuración

### Ajustes

| Ajuste                                 | Lo que hace                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Estaciones                             | Tripletes (`1050:CA:SNTL`), números (`766`), direcciones de páginas del NRCS o nombres, separados por comas. |
| Alrededor de mi casa                   | Sigue también las 3 estaciones SNOTEL más cercanas a 50, 100 o 200 km de su casa.                            |
| Unidades                               | Métricas (cm, mm, °C) o imperiales (pulgadas, °F) para los nuevos dispositivos.                              |
| Idioma de los nombres de las funciones | Nombres de las funciones de los nuevos dispositivos e idioma de sus textos.                                  |

Se siguen como máximo 20 estaciones desde los ajustes. Guarde, abra la pestaña **Descubrir** y
cree los dispositivos que desee: una estación cuyo dispositivo existe sigue siendo seguida
aunque la quite de los ajustes. Eliminar el dispositivo detiene su seguimiento.

Un dispositivo conserva las unidades y los nombres de su creación. Tras cambiar las unidades, la
pestaña Descubrir ofrece **actualizar** el dispositivo; mientras tanto, sus valores siguen en sus
unidades anteriores.

### Encontrar sus estaciones

El botón **«Buscar estaciones»** de la configuración enumera hasta 15 estaciones con su
triplete, estado, altitud en pies y metros y, si su casa tiene ubicación, su distancia:

- elija un **estado** para enumerar sus estaciones (las más cercanas primero, si no por orden
  alfabético);
- escriba un **nombre** (Snowbird), un condado, un **número** de estación (1050) o un
  **triplete**;
- deje todo vacío para enumerar las estaciones alrededor de su casa.

Copie los tripletes en «Estaciones» y guarde.

## Dispositivos

| Función                           | Tipo en Gladys                | Unidad        | Notas                                                       |
| --------------------------------- | ----------------------------- | ------------- | ----------------------------------------------------------- |
| Espesor de nieve                  | Sensor de nivel (profundidad) | cm o pulgadas | Sensor de ultrasonidos, horario.                            |
| Nieve nueva (24 h)                | Sensor de nivel (profundidad) | cm o pulgadas | Espesor ganado en 24 horas, véase más abajo.                |
| Equivalente en agua de la nieve   | Sensor de nivel (profundidad) | mm o pulgadas | Almohada de nieve, horario.                                 |
| Agua de la nieve, % de la mediana | Sensor de nivel (porcentaje)  | %             | Valor diario de ayer frente a la mediana de la fecha.       |
| Temperatura del aire              | Sensor de temperatura         | °C o °F       | Temperatura observada, horaria.                             |
| Última medición                   | Texto                         |               | Fecha de la última medición, o «Sin nueva medición desde…». |

Una función solo existe si la estación la mide. La **nieve nueva** es el espesor de nieve actual
menos el espesor más bajo de las 24 horas anteriores (cada hora suavizada con sus vecinas, para
que una medición aberrante del sensor no cuente): la nieve nueva se asienta, así que es un
límite inferior de lo que ha caído. El porcentaje de la mediana solo se da si el NRCS publica
una mediana para la estación: las estaciones recientes, sobre todo en Alaska, no la tienen. A
principio de temporada, una mediana pequeña da porcentajes grandes.

Los valores se actualizan cada hora en el contenedor (las estaciones transmiten cada hora, a
veces por lotes cada pocas horas). Tras 12 horas sin nueva medición, los valores se detienen y
«Última medición» indica desde cuándo.

## Widget de panel

Añada el widget **Nieve SNOTEL** a un panel:

- sin ajuste, enumera sus estaciones (10 como máximo): espesor de nieve y nieve nueva de 24
  horas; una línea pasa a azul con un icono de nieve cuando ha nevado;
- con una estación elegida, muestra sus mosaicos de espesor de nieve, nieve nueva y equivalente
  en agua, y luego el porcentaje de la mediana, la temperatura del aire y la última medición.

Los nombres son los que usted dio a los dispositivos en Gladys.

## Ejemplos de escenas

- **Alerta de nieve polvo**: desencadenante «el valor de un dispositivo cambia», función «Nieve
  nueva (24 h)» de su estación favorita, por encima de 20 (cm): envíese un mensaje a las 6.
- **Manto de nieve por debajo de lo normal**: función «Agua de la nieve, % de la mediana» por
  debajo de 70: un mensaje para prever el agua del verano.
- **Helada en el inicio del sendero**: función «Temperatura del aire» por debajo de -15 °C.

## Fuentes de datos, licencia y cuotas

- Datos: la red SNOTEL del **Natural Resources Conservation Service del USDA**, leída a través
  de la **API REST AWDB** pública (`wcc.sc.egov.usda.gov/awdbRestApi`). Datos del gobierno de
  Estados Unidos, de dominio público. Los valores horarios son provisionales; el NRCS los revisa
  después.
- Solicitudes: como máximo tres por hora para todas sus estaciones juntas (valores horarios;
  cada 6 horas los valores diarios y las medianas; una vez al día los metadatos de las
  estaciones), más la lista de estaciones, una vez por semana, si sigue estaciones por nombre o
  alrededor de su casa. La API no tiene cuota publicada, pero su cortafuegos rechaza las ráfagas
  de solicitudes (HTTP 403): la integración simplemente vuelve a intentarlo a la hora siguiente.
- Probada contra la API real el 12 de noviembre de 2026 (estaciones de California, Colorado,
  Utah, Washington y Alaska, una estación sin sensor de nieve y un triplete desconocido).

## Solución de problemas

- **«Estación desconocida»**: compruebe el triplete con «Buscar estaciones»; una estación
  inactiva no está en la lista SNOTEL.
- **«El servicio del NRCS (AWDB) no responde»**: la API está caída o rechaza solicitudes un
  tiempo; las mediciones vuelven solas.
- **Sin espesor de nieve en un dispositivo**: el sensor de la estación no envía nada (en verano,
  o averiado); los demás valores siguen llegando.
- **Sin porcentaje de la mediana**: el NRCS no tiene mediana para esta estación o esta fecha.
- **Registros**: ponga `LOG_LEVEL=debug` para ver cada actualización. En el nivel por defecto,
  solo se registran el arranque, las estaciones que callan o vuelven, y los errores.

## Límites

- Datos brutos y provisionales: no es una alerta de aludes, crecidas o meteorológica.
- La nieve nueva se calcula a partir del espesor de nieve, no se mide: el asentamiento, el viento
  y el ruido del sensor la hacen aproximada.
- Sin afiliación con el USDA ni el NRCS. SNOTEL es un programa del NRCS del USDA.
