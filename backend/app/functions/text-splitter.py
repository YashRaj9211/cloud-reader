from langchain_text_splitters import MarkdownHeaderTextSplitter


def markdown_splitter(document: str) -> list[str]:
    headers_to_split_on = [("###", 1), ("####", 2), ("#####", 3), ("######", 4)]
    strip_headers = False
    text_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=headers_to_split_on,
        strip_headers=strip_headers
    )
    texts = text_splitter.split_text(document)
    return texts