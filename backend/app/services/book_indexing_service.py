class BookIndexer:
    def index_book(self, book_id: str):
        #queue book to pdf processing service
        #fetch book from google drive based on bookId
        #chunck text in parsable chunks
        #generate embeddings for each chunk
        #store embeddings in chromadb
        #update bookInfo in db to mark the field  isIndexed: true
        #create a notification event and queue it to be sent to the user
        pass
