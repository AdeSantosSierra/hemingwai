import hashlib
from datetime import datetime
import re
import json # For potentially structured LLM output, if needed

class Utils:

    criterios = {
        1: {
            "nombre": "Interpretación del periodista",
            "instruccion": "Analiza si hay interpretaciones explícitas del periodista. Si aparecen interpretaciones explícitas del periodista, puntúa negativa y proporcionalmente a cuántas haya. Si no hay interpretaciones explícitas en el texto, puntúa positivamente. Las interpretaciones explícitas aparecen en el texto reflejadas como adjetivos calificativos, verbos cargados de connotaciones mayormente negativas o hiperbólicas y afirmaciones tendenciosas con tópicos, categorizaciones."
        },
        2: {
            "nombre": "Opiniones",
            "instruccion": "Identifica y contabiliza las opiniones explícitas del periodista. Si hay opiniones explícitas del periodista, señala concretamente cuántas y cuáles en la columna de justificación y razones y puntúa negativamente. Si no hay opiniones explícitas puntúa positivamente."
        },
        3: {
            "nombre": "Cita de fuentes",
            "instruccion": "Evalúa la citación de fuentes. Si el periodista cita la fuente antes o después de hacer una afirmación sobre una información puntúa positivamente, si no hay cita, puntúa negativamente y señala en qué parte del texto hay ausencia de esa cita o citas donde debería haberla. Si el periodista no cita ninguna fuente en toda la noticia, puntuar negativamente e indicarlo en la justificación o razón. Si cita, al menos, dos o tres fuentes, puntuar positivamente."
        },
        4: {
            "nombre": "Confiabilidad de las fuentes",
            "instruccion": "Analiza la confiabilidad de las fuentes citadas. Si la fuente que cita resulta confiable y adecuada para la afirmación o información que se está dando, puntuar positivamente, si no, puntuar negativamente, señalarlo y expresar dónde y en qué afirmación literal la cita o citas no son confiables y por qué no lo son en la categoría de justificación."
        },
        5: {
            "nombre": "Trascendencia",
            "instruccion": "el acontecimiento o acción humana o de la naturaleza que relata la noticia es importante porque sus consecuencias afectan a la vida de las personas siendo 0 muy poco trascendente y 10 muy trascendente. Para establecer el criterio de trascendencia se ha de tener en cuenta el bien o el mal humano que generan las consecuencias del acontecimiento relatado. De esta manera, el acontecimiento con mayor trascendencia será el que mayor bien o mayor mal cause al mayor número de personas según su naturaleza humana, anhelos y aspiraciones vitales de felicidad, plenitud y de alcanzar el bien mayor. La evaluación deberás hacerla atendiendo al público al que podría ir dirigida esa noticia y al bien común que supone para la sociedad o el público objetivo conocer esa noticia. Señala la razón o justificación concreta que te lleva a evaluar la noticia como trascendente o intrascendente."
        },
        6: {
            "nombre": "Relevancia de los datos",
            "instruccion": "Relevancia de los datos proporcionados en el relato noticioso. Hay que evaluar si los datos elegidos son los más relevantes del acontecimiento de entre todos los que se podrían escoger señalando en la columna de la justificación las ausencias de datos importantes que puedan faltar en la noticia."
        },
        7: {
            "nombre": "Precisión y claridad",
            "instruccion": "Evalúa la precisión y claridad de los conceptos y palabras utilizadas. Se puntúa positivamente si las palabras utilizadas son las más adecuadas y negativamente si las palabras o proposiciones son poco precisas para relatar el acontecimiento o si tienen un significado ambiguo. Ten en cuenta si hay un lenguaje muy técnico o por el contrario hay un estilo de escritura claro y conciso para que los lectores puedan entender fácilmente la información."
        },
        8: {
            "nombre": "Enfoque",
            "instruccion": "Valora si los aspectos destacados son adecuados para comprender el acontecimiento. Puntúa positivamente si el aspecto o aspectos del acontecimiento del que se informa son los adecuados para comprender lo que ha ocurrido o si no lo son. En el caso de no serlo, expresa en la columna de justificación de tu evaluación cuál sería un mejor enfoque o que podría haberse destacado para que el enfoque fuera menos parcial."
        },
        9: {
            "nombre": "Contexto",
            "instruccion": "Verifica si la noticia proporciona contexto suficiente mediante párrafos introductorios, aclaraciones o complementos informativos. Puntúa positivamente si hay un Tie-in o párrafo de contexto al principio o al final de la noticia o aparecen aclaraciones pertinentes cuando es necesario contextualizar algún aspecto del acontecimiento y puntúa negativamente si la noticia carece de ellos."
        },
        10: {
            "nombre": "Ética",
            "instruccion": "Examina si la noticia respeta la privacidad, dignidad y derechos humanos. Puntúa positivamente si la noticia respeta la privacidad, la dignidad, los derechos humanos de las personas involucradas en las noticias y los lectores que la van a recibir y puntúa negativamente si hay ausencia de todo ello o difamación, calumnia y sensacionalismo. Señala en las observaciones y comentarios dónde se hacen esos ataques en la noticia si es que los hubiere. Finalmente haz un sumatorio de la evaluación final en la última fila de la tabla."
        }
    }

    INDICACIONES_ESTILO_COMUNES = """
INDICACIONES DE ESTILO Y ENFOQUE PARA LA SALIDA O OUTPUT DE RESPUESTA AL ANÁLISIS 
Para mostrar la expresión de tu salida tras el análisis de la noticia evita: 
1. Argumentar con el cumplimiento de estándares éticos y profesionales del periodismo. Nuestro análisis es fundamentalmente epistemológico y huye en gran medida, aunque lo tiene en cuenta, de argumentar sobre cumplimientos de estándares éticos y profesionales, muy discutibles por otro lado. 
2. La conclusión debe citar, al menos, la afirmación o informaciones más relevantemente incorrectas más relevante de las que aparecen en la noticia y la más dañina de todas y no lanzar adjetivos calificativos para mostrar sus errores o aciertos. La fórmula de respuesta sobre la redacción sería: “incorrectas como por ejemplo” 
3. El outpout o respuesta de salida debe evitar hacer juicios morales sobre el trabajo del periodista o redactor. Se señala el error, cómo hacerlo adecuadamente o se sugieren mejoras. Y para ello, la conclusión debe argumentarse sobre hechos y datos y dar ejemplos respecto de lo que critica. 
4. La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y desinforman al público. 
Para responder, evitar utilizar expresiones cómo: 
La veracidad o imparcialidad, nunca neutralidad porque la verdad no es neutral. 
Evitar hablar de lenguaje neutral. Solo se habla de lenguaje imparcial, ecuánime o adecuado. 
Evitar expresiones como “noticias objetivas”. Mejor utilizar relatos veraces y noticias verdaderas.  
Usar expresiones como “fundadas en hechos o datos que “factual” 
Evita el uso de expresiones como: “hechos verficables”. Eso es una redundancia. Utilizar solo la expresión o palabra “Hechos” o “datos” es suficiente. 
¡MUY IMPORTANTE! Evita las expresiones “hecho objetivo”, “dato objetivo” “interpretación subjetiva”, “verdad objetiva”, “neutral”. Utilizar, en cambio solo “hecho”, “dato”, “interpretación”, “verdad”, “imparcial”, “ecuánime”, “adecuado”. 

Ejemplos de salida pueden ser:
1º La noticia es sobresaliente porque ofrece un relato ordenado y veraz en el que las afirmaciones del periodista
están sustentadas en datos y/o declaraciones relevantes y suficientes para la comprensión del acontecimiento.
2º La noticia es aceptable porque ofrece datos y declaraciones ciertas pero insuficientes para una contextualización 
y comprensión adecuada del acontecimiento.
3º La noticia es deficiente porque ofrece interpretaciones explícitas y afirmaciones sesgadas del periodista sin 
fundamento en los datos de la realidad, ofrece datos y declaraciones irrelevantes que descontextualizan la 
relevancia y comprensión del acontecimiento.
4º La noticia es desinformativa porque ofrece datos y/o declaraciones falsas, contiene interpretaciones explícitas 
sin fundamento en la realidad, datos insuficientes, irrelevantes y descontextualizadores que deforman la realidad y 
desinforman al público. 
"""

    @staticmethod
    def codificar_url_sha256(url):
        return hashlib.sha256(url.encode('utf-8')).hexdigest()

    @staticmethod
    def obtener_fecha_hora_actual_iso():
        return datetime.now().isoformat()

    @staticmethod
    def _construir_prompt_analisis_completo():
        prompt_criterios = "\n\n".join(
            [f"Criterio {idx}: {crit['nombre']}\nInstrucción específica: {crit['instruccion']}"
             for idx, crit in Utils.criterios.items()]
        )
        return f"""
Por favor, analiza la siguiente noticia en base a TODOS los criterios listados a continuación.
Para CADA criterio, proporciona:
1. Un análisis cualitativo detallado (Óptima, Positiva, Regular, Negativa, Desinformativa), justificando tu decisión con partes específicas del texto y mencionando áreas de mejora.
2. Una puntuación numérica del 1 al 100, donde 100 es la mejor calificación para ese criterio.

Noticia a analizar:
Título: {{titulo}}
Cuerpo: {{noticia}}

Criterios a evaluar:
{prompt_criterios}

{Utils.INDICACIONES_ESTILO_COMUNES}

FORMATO DE SALIDA ESPERADO (usa exactamente este formato):
Debes generar una respuesta para cada criterio, incluso si la información es repetitiva. No omitas ningún criterio.

CRITERIO_ANALISIS_START
ID_CRITERIO: 1
NOMBRE_CRITERIO: {Utils.criterios[1]['nombre']}
ANALISIS: [Tu análisis cualitativo para el criterio 1]
PUNTUACION: [Tu puntuación para el criterio 1]
CRITERIO_ANALISIS_END

CRITERIO_ANALISIS_START
ID_CRITERIO: 2
NOMBRE_CRITERIO: {Utils.criterios[2]['nombre']}
ANALISIS: [Tu análisis cualitativo para el criterio 2]
PUNTUACION: [Tu puntuación para el criterio 2]
CRITERIO_ANALISIS_END

... (continúa para todos los 10 criterios) ...

CRITERIO_ANALISIS_START
ID_CRITERIO: 10
NOMBRE_CRITERIO: {Utils.criterios[10]['nombre']}
ANALISIS: [Tu análisis cualitativo para el criterio 10]
PUNTUACION: [Tu puntuación para el criterio 10]
CRITERIO_ANALISIS_END
"""

    @staticmethod
    def _parse_analisis_completo(texto_respuesta_llm):
        resultados = {}
        # Regex para capturar cada bloque de análisis de criterio
        # Asegura capturar el nombre del criterio para usarlo como clave si es necesario, o el ID
        pattern = re.compile(
            r"CRITERIO_ANALISIS_START\s*"
            r"ID_CRITERIO:\s*(?P<id>\d+)\s*"
            r"NOMBRE_CRITERIO:\s*(?P<nombre_criterio>[^\n]+)\s*"
            r"ANALISIS:\s*(?P<analisis>.*?)\s*"
            r"PUNTUACION:\s*(?P<puntuacion>\d+)\s*"
            r"CRITERIO_ANALISIS_END",
            re.DOTALL | re.IGNORECASE
        )
        
        for match in pattern.finditer(texto_respuesta_llm):
            data = match.groupdict()
            criterion_id = int(data['id'])
            
            # Validar puntuación
            try:
                score = int(data['puntuacion'])
                if not (1 <= score <= 100):
                    score = 0 # Default o manejar error
            except ValueError:
                score = 0 # Default o manejar error

            resultados[criterion_id] = {
                "nombre": data['nombre_criterio'].strip(),
                "analisis": data['analisis'].strip(),
                "puntuacion": score
            }
        
        # Verificar si se parsearon todos los criterios
        for i in range(1, 11):
            if i not in resultados:
                 resultados[i] = { # Agrega entrada por defecto si falta alguno
                    "nombre": Utils.criterios[i]['nombre'],
                    "analisis": "Error: No se pudo parsear la respuesta del LLM para este criterio.",
                    "puntuacion": 0
                }
        return resultados


    @staticmethod
    def generar_analisis_completo_claude(cliente_anthropic, titulo, noticia):
        prompt_completo = Utils._construir_prompt_analisis_completo().format(titulo=titulo, noticia=noticia)
        
        # Claude API puede devolver una lista de bloques de contenido
        response_content_blocks = cliente_anthropic.messages.create(
            model="claude-3-opus-20240229", # Usar el modelo más capaz para tareas complejas
            max_tokens=4000, # Aumentar tokens para respuesta completa
            messages=[{"role": "user", "content": prompt_completo}]
        ).content
        
        # Unir los bloques de texto si es una lista
        full_response_text = ""
        if isinstance(response_content_blocks, list):
            for block in response_content_blocks:
                if hasattr(block, 'text'):
                    full_response_text += block.text + "\n"
        else: # Si no es lista, asumir que es un objeto con atributo text (o similar)
             if hasattr(response_content_blocks, 'text'):
                full_response_text = response_content_blocks.text

        return full_response_text.strip()

    @staticmethod
    def generar_analisis_completo_gpt(cliente_openai, titulo, noticia, analisis_claude_completo):
        prompt_refinamiento = f"""
Revisa el siguiente análisis de una noticia realizado por otro LLM (Claude). 
Tu tarea es actuar como un supervisor experto y refinar este análisis para cada uno de los 10 criterios.
Asegúrate de proporcionar tu propio análisis cualitativo y puntuación (1-100) para CADA criterio.
Adopta el mismo formato de salida que se te indicará al final.

Noticia:
Título: {titulo}
Cuerpo: {noticia}

Análisis de Claude a revisar y refinar:
--- CLAUDE START ---
{analisis_claude_completo}
--- CLAUDE END ---

{Utils.INDICACIONES_ESTILO_COMUNES}

Debes refinar el análisis y las puntuaciones para TODOS los 10 criterios.
FORMATO DE SALIDA ESPERADO (usa exactamente este formato):
CRITERIO_ANALISIS_START
ID_CRITERIO: 1
NOMBRE_CRITERIO: {Utils.criterios[1]['nombre']}
ANALISIS: [Tu análisis cualitativo REFINADO para el criterio 1]
PUNTUACION: [Tu puntuación REFINADA para el criterio 1]
CRITERIO_ANALISIS_END

CRITERIO_ANALISIS_START
ID_CRITERIO: 2
NOMBRE_CRITERIO: {Utils.criterios[2]['nombre']}
ANALISIS: [Tu análisis cualitativo REFINADO para el criterio 2]
PUNTUACION: [Tu puntuación REFINADA para el criterio 2]
CRITERIO_ANALISIS_END

... (continúa para todos los 10 criterios) ...

CRITERIO_ANALISIS_START
ID_CRITERIO: 10
NOMBRE_CRITERIO: {Utils.criterios[10]['nombre']}
ANALISIS: [Tu análisis cualitativo REFINADO para el criterio 10]
PUNTUACION: [Tu puntuación REFINADA para el criterio 10]
CRITERIO_ANALISIS_END
"""
        response = cliente_openai.chat.completions.create(
            model="gpt-4o", # Usar el modelo más capaz
            messages=[
                {"role": "system", "content": "Eres un analista experto en noticias encargado de refinar análisis previos."},
                {"role": "user", "content": prompt_refinamiento}
            ],
            temperature=0.5 # Un poco de creatividad para refinar, pero no demasiada
        )
        return response.choices[0].message.content

    @staticmethod
    def analizar_noticia(cliente_anthropic, cliente_openai, titulo, noticia):
        # Paso 1: Claude genera el análisis completo
        analisis_claude_texto = Utils.generar_analisis_completo_claude(cliente_anthropic, titulo, noticia)
        
        # (Opcional) Parsear salida de Claude para verla o para lógica intermedia, aunque GPT la recibirá en crudo.
        # resultados_claude_parseados = Utils._parse_analisis_completo(analisis_claude_texto)

        # Paso 2: GPT refina el análisis completo de Claude
        analisis_gpt_refinado_texto = Utils.generar_analisis_completo_gpt(cliente_openai, titulo, noticia, analisis_claude_texto)

        # Paso 3: Parsear la respuesta final de GPT
        resultados_finales = Utils._parse_analisis_completo(analisis_gpt_refinado_texto)
        
        # Historial simplificado (opcional, pero puede ser útil para debugging)
        # historial = [
        #     {"rol": "Claude", "contenido_raw": analisis_claude_texto, "contenido_parseado": resultados_claude_parseados},
        #     {"rol": "GPT", "contenido_raw": analisis_gpt_refinado_texto, "contenido_parseado": resultados_finales}
        # ]
        # Aquí se podría añadir una ronda de evaluación y mejora si fuera estrictamente necesario,
        # pero el objetivo es reducir llamadas. Por ahora, tomamos la salida refinada de GPT como final.
        
        return resultados_finales # Este es el diccionario {id_criterio: {"nombre": ..., "analisis": ..., "puntuacion": ...}}

    # Esta función ya no sería necesaria en Hemingwai.py si las puntuaciones se integran
    # @staticmethod
    # def obtener_puntuacion_final(cliente_openai, titulo, noticia, resultado_final):
    #     # ... (código original, ahora obsoleto si el plan funciona) ...
    #     pass


    @staticmethod
    def generar_texto_referencia(cliente_openai, titulo, noticia, valoraciones_dict):
        # valoraciones_dict es ahora un dict de dicts: {1: {"analisis": "...", "puntuacion": ...}, ...}
        # Necesitamos adaptar la entrada para este prompt si es que aún se usa de la misma forma.
        # Por ahora, asumimos que el prompt espera textos de análisis.
        
        valoraciones_texto_para_prompt = ""
        for crit_id, data in valoraciones_dict.items():
            nombre_crit = Utils.criterios[crit_id]["nombre"]
            valoraciones_texto_para_prompt += f"Análisis para '{nombre_crit}': {data['analisis']}\n"

        prompt = f"""
        Considera la siguiente noticia:
        Título: {titulo}
        Noticia: {noticia}

        Y las valoraciones obtenidas:
        {valoraciones_texto_para_prompt}

        Registra la siguiente instrucción:
        Justifica la valoración escribiendo en qué partes del texto se basa para tomar esas conclusiones. Escribe la  
        valoración específica por una parte y el fragmento de la noticia a la que hace referencia por otra, unidos por "|", 
        los fragmentos de la noticia escríbelos entre corchetes []. Quiero que la respuesta que me proporciones no contenga 
        nada más que lo que se requiere, sin palabras adicionales. 
        """
        response = cliente_openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un analista experto en noticias."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3
        )
        return response.choices[0].message.content

    @staticmethod
    def obtener_valoracion_general(openai_client, titulo, noticia, valoraciones_dict):
        # valoraciones_dict es ahora {id_criterio: {"analisis": ..., "puntuacion": ...}}
        prompt_text = "Para las siguientes valoraciones obtenidas:\n\n"
        for crit_id, data in valoraciones_dict.items():
            nombre_crit = Utils.criterios[crit_id]["nombre"] # Obtener nombre del criterio
            prompt_text += f"Criterio '{nombre_crit}': {data['analisis']} (Puntuación: {data['puntuacion']})\n"
        
        prompt_text += (
            f"""
            Realiza una breve síntesis de lo anterior para generar una valoración general de la noticia {noticia} titulada 
            '{titulo}'. La valoración debe resumir los puntos clave y ser concisa."""
        )
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un experto en análisis de noticias."},
                {"role": "user", "content": prompt_text}
            ]
        )
        return response.choices[0].message.content.strip()


    @staticmethod
    def crear_diccionario_citas(texto_referencia):
        diccionario_citas = {}
        lineas = texto_referencia.splitlines()
        for linea in lineas:
            linea = linea.strip()
            if not linea or '|' not in linea:
                continue
            valoracion, fragmentos_str = linea.split('|', 1)
            valoracion = valoracion.strip()
            valoracion = re.sub(r'^\d+\.\s*', '', valoracion)
            fragmentos = re.findall(r'\[(.*?)\]', fragmentos_str)
            for fragmento in fragmentos:
                fragmento_limpio = fragmento.strip().strip('"').strip("'")
                diccionario_citas[fragmento_limpio] = valoracion
        return diccionario_citas

    @staticmethod
    def convertir_markdown_a_html(markdown_input):
        if isinstance(markdown_input, dict):
            return {k: Utils.convertir_markdown_a_html(v) for k, v in markdown_input.items()}
        if not isinstance(markdown_input, str):
            return markdown_input # No es string, devolver como está

        markdown_text = markdown_input
        # Simplificaciones intencionales aquí para brevedad, la función original es compleja
        markdown_text = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', markdown_text)
        markdown_text = re.sub(r'\*(.*?)\*', r'<em>\1</em>', markdown_text)
        markdown_text = re.sub(r'^#{1,6}\s+(.*)$', lambda m: f'<h{len(m.group(0).split(" ")[0])}>{m.group(1)}</h{len(m.group(0).split(" ")[0])}>', markdown_text, flags=re.MULTILINE)
        # Convertir saltos de línea a <br> para HTML, a menos que sean parte de otras estructuras (simplificado)
        # Envolver en <p> si no es ya un bloque HTML
        if not markdown_text.startswith('<'):
             lines = [f'<p>{line}</p>' for line in markdown_text.split('\n') if line.strip()]
             return '\n'.join(lines)
        return markdown_text # Devolver como está si ya parece HTML o es complejo


    @staticmethod
    def sanitize(obj):
        if isinstance(obj, dict):
            return {k.replace('.', '_'): Utils.sanitize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [Utils.sanitize(v) for v in obj]
        if not isinstance(obj, (str, int, float, bool, type(None))):
            return str(obj)
        return obj

    # --- ANALIZAR TITULAR ---
    # Simplificando el mecanismo de consenso para analizar_titular
    
    @staticmethod
    def _construir_prompt_titular(titular):
        criterio_titular = {
            "nombre": "Evaluación del titular",
            "instruccion": "Analiza si el titular es adecuado en cuanto a veracidad, claridad y relevancia o si resulta ser clickbait. Justifica tu análisis. Si consideras que es clickbait o inadecuado, incluye una propuesta de titular mejorado con el formato 'TITULO PROPUESTO: [tu versión alternativa aquí]'."
        }
        return f"""
        Titular a analizar: {titular}

        Instrucción: {criterio_titular['instruccion']}
        Nombre del Criterio: {criterio_titular['nombre']}

        {Utils.INDICACIONES_ESTILO_COMUNES}

        FORMATO DE SALIDA ESPERADO:
        ANALISIS_TITULAR: [Tu análisis detallado sobre si el titular es adecuado o clickbait, y por qué]
        ES_CLICKBAIT: [Sí/No]
        TITULO_PROPUESTO: [Tu versión alternativa aquí, si aplica. Si no aplica, escribe "N/A"]
        """

    @staticmethod
    def _parse_analisis_titular(respuesta_llm):
        analisis = re.search(r"ANALISIS_TITULAR:\s*(.*?)(?=\nES_CLICKBAIT:|\Z)", respuesta_llm, re.DOTALL | re.IGNORECASE)
        es_clickbait_match = re.search(r"ES_CLICKBAIT:\s*(Sí|No)", respuesta_llm, re.IGNORECASE)
        propuesto_match = re.search(r"TITULO_PROPUESTO:\s*(.*)", respuesta_llm, re.IGNORECASE)

        return {
            "analisis": analisis.group(1).strip() if analisis else "Error al parsear análisis del titular.",
            "es_clickbait": es_clickbait_match.group(1).lower() == 'sí' if es_clickbait_match else False,
            "titular_propuesto": propuesto_match.group(1).strip() if propuesto_match and propuesto_match.group(1).strip().lower() != "n/a" else None
        }

    @staticmethod
    def analizar_titular(cliente_anthropic, cliente_openai, titular):
        prompt_claude_titular = Utils._construir_prompt_titular(titular)

        # 1. Claude analiza el titular
        claude_response_content = cliente_anthropic.messages.create(
            model="claude-3-haiku-20240307", # Modelo más rápido para tareas más simples
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt_claude_titular}]
        ).content
        
        claude_raw_output = ""
        if isinstance(claude_response_content, list):
            claude_raw_output = "".join(block.text for block in claude_response_content if hasattr(block, 'text'))
        elif hasattr(claude_response_content, 'text'):
            claude_raw_output = claude_response_content.text
            
        # 2. GPT refina/confirma el análisis del titular de Claude
        prompt_gpt_refinamiento_titular = f"""
        Revisa el siguiente análisis de un titular realizado por Claude. 
        Tu tarea es actuar como un supervisor experto y refinar este análisis.
        Proporciona tu propio análisis, determina si es clickbait y ofrece un titular alternativo si es necesario.
        Adopta el formato de salida especificado.

        Titular original: {titular}
        Análisis de Claude:
        --- CLAUDE START ---
        {claude_raw_output}
        --- CLAUDE END ---

        {Utils.INDICACIONES_ESTILO_COMUNES}

        FORMATO DE SALIDA ESPERADO:
        ANALISIS_TITULAR: [Tu análisis REFINADO sobre si el titular es adecuado o clickbait, y por qué]
        ES_CLICKBAIT: [Sí/No]
        TITULO_PROPUESTO: [Tu versión alternativa REFINADA aquí, si aplica. Si no aplica, escribe "N/A"]
        """
        
        gpt_response = cliente_openai.chat.completions.create(
            model="gpt-4o", # GPT-4o es bueno para este tipo de refinamiento
            messages=[
                {"role": "system", "content": "Eres un analista experto en titulares de noticias."},
                {"role": "user", "content": prompt_gpt_refinamiento_titular}
            ],
            temperature=0.3
        )
        gpt_raw_output = gpt_response.choices[0].message.content
        
        # Parsear la respuesta final de GPT
        parsed_output = Utils._parse_analisis_titular(gpt_raw_output)

        # El "historial" ahora es implícito en el flujo Claude -> GPT
        # La "valoracion_titular" para Hemingwai.py debería ser el análisis y si es clickbait
        # El "titular_reformulado" es el "titular_propuesto"
        
        # Estructura para Hemingwai.py
        # Hemingwai espera: resultados_titular.get("titular_reformulado")
        # y usa 'resultados_titular' para 'valoracion_titular'
        # y 'es_clickbait' se deriva de si hay titular_reformulado
        
        final_results = {
            "analisis_completo": parsed_output["analisis"], # El texto del análisis
            "es_clickbait_evaluado": parsed_output["es_clickbait"], # Booleano directo
            "titular_reformulado": parsed_output["titular_propuesto"], # El string del título o None
            # Para mantener compatibilidad con el uso en Hemingwai.py que podría guardar todo el dict:
            "raw_claude_output": claude_raw_output, # Para debugging o referencia
            "raw_gpt_output": gpt_raw_output # Para debugging o referencia
        }
        return final_results

```
