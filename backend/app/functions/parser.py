from pdf_inspector import process_pdf


def pdf_parser(path_of_pdf: str) -> str:
    markdown = process_pdf(path_of_pdf)
    return markdown